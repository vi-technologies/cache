import * as core from "@actions/core";

import { Events, Inputs, RefKey } from "../src/constants";
import { restoreImpl } from "../src/restoreImpl";
import { StateProvider } from "../src/stateProvider";
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

test("restore with invalid event outputs warning", async () => {
    const logWarningMock = jest.spyOn(actionUtils, "logWarning");
    const failedMock = jest.spyOn(core, "setFailed");
    const invalidEvent = "commit_comment";
    process.env[Events.Key] = invalidEvent;
    delete process.env[RefKey];
    await restoreImpl(new StateProvider());
    expect(logWarningMock).toHaveBeenCalledWith(
        `Event Validation Error: The event type ${invalidEvent} is not supported because it's not tied to a branch or tag ref.`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("restore without AC available should no-op", async () => {
    jest.spyOn(actionUtils, "isGhes").mockImplementation(() => false);
    jest.spyOn(actionUtils, "isCacheFeatureAvailable").mockImplementation(
        () => false
    );

    const restoreCacheMock = jest.spyOn(cacheUtils, "restoreCache");
    const setCacheHitOutputMock = jest.spyOn(core, "setOutput");

    await restoreImpl(new StateProvider());

    expect(restoreCacheMock).toHaveBeenCalledTimes(0);
    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "false");
});

test("restore on GHES without AC available should no-op", async () => {
    jest.spyOn(actionUtils, "isGhes").mockImplementation(() => true);
    jest.spyOn(actionUtils, "isCacheFeatureAvailable").mockImplementation(
        () => false
    );

    const restoreCacheMock = jest.spyOn(cacheUtils, "restoreCache");
    const setCacheHitOutputMock = jest.spyOn(core, "setOutput");

    await restoreImpl(new StateProvider());

    expect(restoreCacheMock).toHaveBeenCalledTimes(0);
    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "false");
});

test("restore on GHES with AC available ", async () => {
    jest.spyOn(actionUtils, "isGhes").mockImplementation(() => true);
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

    await restoreImpl(new StateProvider());

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(key, bucketName, {
        lookupOnly: false
    });

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "true");

    expect(infoMock).toHaveBeenCalledWith(`Cache restored from key: ${key}`);
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("restore with no path should fail", async () => {
    const failedMock = jest.spyOn(core, "setFailed");
    const restoreCacheMock = jest.spyOn(cacheUtils, "restoreCache");
    await restoreImpl(new StateProvider());
    expect(restoreCacheMock).toHaveBeenCalledTimes(0);
    // this input isn't necessary for restore b/c tarball contains entries relative to workspace
    expect(failedMock).not.toHaveBeenCalledWith(
        "Input required and not supplied: path"
    );
});

test("restore with no key", async () => {
    testUtils.setInput(Inputs.Path, "node_modules");
    const failedMock = jest.spyOn(core, "setFailed");
    const restoreCacheMock = jest.spyOn(cacheUtils, "restoreCache");
    await restoreImpl(new StateProvider());
    expect(restoreCacheMock).toHaveBeenCalledTimes(0);
    expect(failedMock).toHaveBeenCalledWith(
        "Input required and not supplied: key"
    );
});

test("restore with no cache found", async () => {
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
    const restoreCacheMock = jest
        .spyOn(cacheUtils, "restoreCache")
        .mockImplementationOnce(() => {
            return Promise.resolve(undefined);
        });

    await restoreImpl(new StateProvider());

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(key, bucketName, {
        lookupOnly: false
    });

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(failedMock).toHaveBeenCalledTimes(0);

    expect(infoMock).toHaveBeenCalledWith(
        `Cache not found for input key: ${key}`
    );
});

test("restore with cache found for key", async () => {
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

    await restoreImpl(new StateProvider());

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(key, bucketName, {
        lookupOnly: false
    });

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "true");

    expect(infoMock).toHaveBeenCalledWith(`Cache restored from key: ${key}`);
    expect(failedMock).toHaveBeenCalledTimes(0);
});

test("restore with lookup-only set", async () => {
    const path = "node_modules";
    const key = "node-test";
    const bucketName = "my-bucket";
    testUtils.setInputs({
        path: path,
        key,
        lookupOnly: true,
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

    await restoreImpl(new StateProvider());

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(key, bucketName, {
        lookupOnly: true
    });

    expect(stateMock).toHaveBeenCalledWith("CACHE_KEY", key);
    expect(stateMock).toHaveBeenCalledWith("CACHE_RESULT", key);

    expect(setCacheHitOutputMock).toHaveBeenCalledTimes(1);
    expect(setCacheHitOutputMock).toHaveBeenCalledWith("cache-hit", "true");

    expect(infoMock).toHaveBeenCalledWith(
        `Cache found and can be restored from key: ${key}`
    );
    expect(failedMock).toHaveBeenCalledTimes(0);
});
