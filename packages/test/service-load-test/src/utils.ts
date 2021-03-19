/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { Loader } from "@fluidframework/container-loader";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { LocalCodeLoader } from "@fluidframework/test-utils";
import { ITestDriver, TestDriverTypes, ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";
import { createFluidTestDriver } from "@fluidframework/test-drivers";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { assert, LazyPromise } from "@fluidframework/common-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { pkgName, pkgVersion } from "./packageVersion";
import { fluidExport, ILoadTest } from "./loadTestDataStore";
import { ILoadTestConfig, ITestConfig } from "./testConfigFile";

const packageName = `${pkgName}@${pkgVersion}`;

const loggerP = new LazyPromise<ITelemetryBufferedLogger>(async ()=>{
    if (process.env.FLUID_TEST_LOGGER_PKG_PATH) {
        await import(process.env.FLUID_TEST_LOGGER_PKG_PATH);
        const logger = getTestLogger();
        assert(logger !== undefined, "Expected getTestLogger to return something");
        return logger;
    }else{
        return { send: () => {}, flush: async () => {} };
    }
});

const codeDetails: IFluidCodeDetails = {
    package: packageName,
    config: {},
};

const codeLoader = new LocalCodeLoader([[codeDetails, fluidExport]]);

export async function createLoader(testDriver: ITestDriver, runId: number | undefined) {
    // Construct the loader
    const loader = new Loader({
        urlResolver: testDriver.createUrlResolver(),
        documentServiceFactory: testDriver.createDocumentServiceFactory(),
        codeLoader,
        logger: ChildLogger.create(await loggerP, undefined, {all: { runId }}),
    });
    return loader;
}

export async function initialize(testDriver: ITestDriver) {
    const loader = await createLoader(testDriver, undefined);
    const container = await loader.createDetachedContainer(codeDetails);
    container.on("error", (error) => {
        console.log(error);
        process.exit(-1);
    });
    const testId = Date.now().toString();
    const request = testDriver.createCreateNewRequest(testId);
    await container.attach(request);
    container.close();

    return testId;
}

export async function load(testDriver: ITestDriver, testId: string, runId: number) {
    const loader = await createLoader(testDriver, runId);
    const url =  await testDriver.createContainerUrl(testId);
    const container = await loader.resolve({ url });
    return requestFluidObject<ILoadTest>(container,"/");
}

export const createTestDriver =
    async (driver: TestDriverTypes) => createFluidTestDriver(driver,{
        odsp: {
            directory: "stress",
        },
    });

export function getProfile(profileArg: string) {
    let config: ITestConfig;
    try {
        config = JSON.parse(fs.readFileSync("./testConfig.json", "utf-8"));
    } catch (e) {
        console.error("Failed to read testConfig.json");
        console.error(e);
        process.exit(-1);
    }

    const profile: ILoadTestConfig | undefined = config.profiles[profileArg];
    if (profile === undefined) {
        console.error("Invalid --profile argument not found in testConfig.json profiles");
        process.exit(-1);
    }
    return profile;
}

export async function safeExit(code: number) {
    // There seems to be at least one dangling promise in ODSP Driver, give it a second to resolve
    await(new Promise((res) => { setTimeout(res, 1000); }));
    // Flush the logs
    await loggerP.then(async (l)=>l.flush());

    process.exit(code);
}
