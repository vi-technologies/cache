import * as core from "@actions/core";

import { Events, RefKey } from "../src/constants";
import { restoreOnlyRun } from "../src/restoreImpl";
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
            return jest
                .requireActual("../src/utils/actionUtils")
                .getInputAsBool(name, options);
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

test("restore with cache found for key", async () => {
    const path = "node_modules";
    const key = "node-test";
    const bucketName = "my-bucket";
    testUtils.setInputs({
        path: path,
        key,
        bucketName
    });

    const infoMock = jest.spyOn(core, "info");
    const failedMock = jest.spyOn(core, "setFailed");
    const outputMock = jest.spyOn(core, "setOutput");
    const restoreCacheMock = jest
        .spyOn(cacheUtils, "restoreCache")
        .mockImplementationOnce(() => {
            return Promise.resolve(key);
        });

    await restoreOnlyRun();

    expect(restoreCacheMock).toHaveBeenCalledTimes(1);
    expect(restoreCacheMock).toHaveBeenCalledWith(key, bucketName, {
        lookupOnly: false
    });

    expect(outputMock).toHaveBeenCalledWith("cache-primary-key", key);
    expect(outputMock).toHaveBeenCalledWith("cache-hit", "true");
    expect(outputMock).toHaveBeenCalledWith("cache-matched-key", key);

    expect(infoMock).toHaveBeenCalledWith(`Cache restored from key: ${key}`);
    expect(failedMock).toHaveBeenCalledTimes(0);
});
