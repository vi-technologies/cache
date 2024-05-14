import * as core from "@actions/core";

import { Events, RefKey } from "../src/constants";
import { restoreRun } from "../src/restoreImpl";
import * as actionUtils from "../src/utils/actionUtils";
import * as cacheUtils from "../src/utils/cacheUtils";
import * as testUtils from "../src/utils/testUtils";

jest.mock("../src/utils/actionUtils");

beforeAll(() => {
    jest.spyOn(actionUtils, "isExactKeyMatch").mockImplementation(
        (key, cacheResult) => {
            const actualUtils = jest.requireActual("../src/utils/actionUtils");
            return actualUtils.isExactKeyMatch(key, cacheResult);
        }
    );

    jest.spyOn(actionUtils, "isValidEvent").mockImplementation(() => {
        const actualUtils = jest.requireActual("../src/utils/actionUtils");
        return actualUtils.isValidEvent();
    });

    jest.spyOn(actionUtils, "getInputAsArray").mockImplementation(
        (name, options) => {
            const actualUtils = jest.requireActual("../src/utils/actionUtils");
            return actualUtils.getInputAsArray(name, options);
        }
    );

    jest.spyOn(actionUtils, "getInputAsBool").mockImplementation(
        (name, options) => {
            const actualUtils = jest.requireActual("../src/utils/actionUtils");
            return actualUtils.getInputAsBool(name, options);
        }
    );
});

beforeEach(() => {
    jest.restoreAllMocks();
    process.env[Events.Key] = Events.Push;
    process.env[RefKey] = "refs/heads/feature-branch";

    jest.spyOn(actionUtils, "isGhes").mockImplementation(() => false);
    jest.spyOn(actionUtils, "isCacheFeatureAvailable").mockImplementation(
        () => true
    );
});

afterEach(() => {
    testUtils.clearInputs();
    delete process.env[Events.Key];
    delete process.env[RefKey];
});

test("Restore with cache found for key", async () => {
    const path = "node_modules";
    const key = "node-test";
    const bucketName = "my-bucket";
    testUtils.setInputs({
        path: path,
        key,
        enableCrossOsArchive: false,
        bucketName
    });

    const infoMock = jest.spyOn(core, "info");
    const failedMock = jest.spyOn(core, "setFailed");
    const stateMock = jest.spyOn(core, "saveState");
    const setCacheHitOutputMock = jest.spyOn(core, "setOutput");
    const restoreCacheMock = jest
        .spyOn(cacheUtils, "restoreCache")
        .mockImplementationOnce(() => {
            return Promise.resolve(key);
        });

    await restoreRun();

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(key, bucketName, {
        lookupOnly: false
    });

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(stateMock).toHaveBeenCalledWith("CACHE_RESULT", key);

    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "true");

    expect(infoMock).toHaveBeenCalledWith(`Cache restored from key: ${key}`);
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("Fail restore when fail on cache miss is enabled and primary key not found", async () => {
    const path = "node_modules";
    const key = "node-test";
    const bucketName = "my-bucket";
    testUtils.setInputs({
        path: path,
        key,
        failOnCacheMiss: true,
        bucketName
    });

    const failedMock = jest.spyOn(core, "setFailed");
    const stateMock = jest.spyOn(core, "saveState");
    const setCacheHitOutputMock = jest.spyOn(core, "setOutput");
    const restoreCacheMock = jest
        .spyOn(cacheUtils, "restoreCache")
        .mockImplementationOnce(() => {
            return Promise.resolve(undefined);
        });

    await restoreRun();

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(key, bucketName, {
        lookupOnly: false
    });

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(0);

    expect(failedMock).toHaveBeenCalledWith(
        `Failed to restore cache entry. Exiting as fail-on-cache-miss is set. Input key: ${key}`
    );
    expect(failedMock).toHaveBeenCalledTimes(1);
});

test("Restore with fail on cache miss disabled and no cache found", async () => {
    const path = "node_modules";
    const key = "node-test";
    const bucketName = "my-bucket";
    testUtils.setInputs({
        path: path,
        key,
        failOnCacheMiss: false,
        bucketName
    });

    const infoMock = jest.spyOn(core, "info");
    const failedMock = jest.spyOn(core, "setFailed");
    const stateMock = jest.spyOn(core, "saveState");
    const restoreCacheMock = jest
        .spyOn(cacheUtils, "restoreCache")
        .mockImplementationOnce(() => {
            return Promise.resolve(undefined);
        });

    await restoreRun();

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(key, bucketName, {
        lookupOnly: false
    });

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);

    expect(infoMock).toHaveBeenCalledWith(
        `Cache not found for input key: ${key}`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});
