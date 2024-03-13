import * as utils from "@actions/cache/lib/internal/cacheUtils";
import { CompressionMethod } from "@actions/cache/lib/internal/constants";
import { DownloadOptions } from "@actions/cache/lib/options";
import * as core from "@actions/core";
import {
    GetObjectCommand,
    ListObjectsV2Command,
    S3Client
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as crypto from "crypto";
import { createReadStream } from "fs";

import { downloadCacheHttpClientConcurrent } from "./downloadUtils";

export interface ArtifactCacheEntry {
    cacheKey?: string;
    scope?: string;
    cacheVersion?: string;
    creationTime?: string;
    archiveLocation?: string;
}

const versionSalt = "1.0";

const uploadQueueSize = Number(process.env.UPLOAD_QUEUE_SIZE || "4");
const uploadPartSize =
    Number(process.env.UPLOAD_PART_SIZE || "32") * 1024 * 1024;
const downloadQueueSize = Number(process.env.DOWNLOAD_QUEUE_SIZE || "8");
const downloadPartSize =
    Number(process.env.DOWNLOAD_PART_SIZE || "16") * 1024 * 1024;

const s3Client = new S3Client();

export function getCacheVersion(
    paths: string[],
    compressionMethod?: CompressionMethod,
    enableCrossOsArchive = false
): string {
    const components = paths.slice();

    if (compressionMethod) {
        components.push(compressionMethod);
    }

    if (process.platform === "win32" && !enableCrossOsArchive) {
        components.push("windows-only");
    }

    components.push(versionSalt);

    return crypto
        .createHash("sha256")
        .update(components.join("|"))
        .digest("hex");
}

export async function getCacheEntry(bucketName: string, keys: string[]) {
    const cacheEntry: ArtifactCacheEntry = {};
    const useExactKeyMatch = keys.length === 1;

    for (const restoreKey of keys) {
        const listObjectsParams = {
            Bucket: bucketName,
            Prefix: [restoreKey].join("/")
        };

        try {
            const { Contents = [] } = await s3Client.send(
                new ListObjectsV2Command(listObjectsParams)
            );
            const exactMatch = Contents.find(c => c.Key === restoreKey);
            if (Contents.length > 0) {
                if (useExactKeyMatch && exactMatch) {
                    cacheEntry.cacheKey = restoreKey;
                } else {
                    const sortedKeys = Contents.sort(
                        (a, b) =>
                            Number(b.LastModified) - Number(a.LastModified)
                    );
                    cacheEntry.cacheKey = sortedKeys[0].Key;
                }
                cacheEntry.archiveLocation = `s3://${bucketName}/${cacheEntry.cacheKey}`;
                return cacheEntry;
            }
        } catch (error) {
            console.error(
                `Error listing objects with prefix ${restoreKey} in bucket ${bucketName}:`,
                error
            );
        }
    }

    return cacheEntry;
}

export async function downloadCache(
    bucketName: string,
    archiveLocation: string,
    archivePath: string,
    options?: DownloadOptions
): Promise<void> {
    const archiveUrl = new URL(archiveLocation);
    const objectKey = archiveUrl.pathname.slice(1);
    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey
    });
    const url = await getSignedUrl(s3Client, command, {
        expiresIn: 3600
    });
    await downloadCacheHttpClientConcurrent(url, archivePath, {
        ...options,
        downloadConcurrency: downloadQueueSize,
        concurrentBlobDownloads: true,
        partSize: downloadPartSize
    });
}

export async function saveCache(
    bucketName: string,
    key: string,
    archivePath: string
): Promise<void> {
    const multipartUpload = new Upload({
        client: s3Client,
        params: {
            Bucket: bucketName,
            Key: key,
            Body: createReadStream(archivePath)
        },
        partSize: uploadPartSize,
        queueSize: uploadQueueSize
    });

    const cacheSize = utils.getArchiveFileSizeInBytes(archivePath);
    core.info(
        `Cache Size: ~${Math.round(
            cacheSize / (1024 * 1024)
        )} MB (${cacheSize} B)`
    );

    const totalParts = Math.ceil(cacheSize / uploadPartSize);
    core.info(`Uploading cache from ${archivePath} to ${bucketName}/${key}`);
    multipartUpload.on("httpUploadProgress", progress => {
        core.info(`Uploaded part ${progress.part}/${totalParts}.`);
    });

    await multipartUpload.done();
    core.info(`Cache saved successfully.`);
}
