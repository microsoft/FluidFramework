/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import crypto from "crypto";
import fs from "fs";
import { Loader } from "@fluidframework/container-loader";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { LocalCodeLoader } from "@fluidframework/test-utils";
import { ITestDriver, TestDriverTypes, ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";
import { createFluidTestDriver, pairwiseOdspHostStoragePolicy } from "@fluidframework/test-drivers";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { assert, LazyPromise } from "@fluidframework/common-utils";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { pkgName, pkgVersion } from "./packageVersion";
import { createFluidExport, ILoadTest } from "./loadTestDataStore";
import { ILoadTestConfig, ITestConfig } from "./testConfigFile";
import { FaultInjectionDocumentServiceFactory } from "./faultInjectionDriver";
import { pairwiseLoaderOptions } from "./optionsMatrix";

const packageName = `${pkgName}@${pkgVersion}`;

class FileLogger extends TelemetryLogger implements ITelemetryBufferedLogger {
    private error: boolean = false;
    private readonly schema = new Map<string, number>();
    private  logs: ITelemetryBaseEvent[] = [];

    public constructor(private readonly baseLogger?: ITelemetryBufferedLogger) {
        super();
    }

    async flush(runInfo?: {url: string,  runId?: number}): Promise<void> {
        const baseFlushP =  this.baseLogger?.flush();

        if(this.error && runInfo !== undefined) {
            const logs = this.logs;
            const outputDir = `${__dirname}/output/${crypto.createHash("md5").update(runInfo.url).digest("hex")}`;
            if(!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, {recursive: true});
            }
            // sort from most common column to least common
            const schema = [...this.schema].sort((a,b)=>b[1] - a[1]).map((v)=>v[0]);
            const data = logs.reduce(
                (file, event)=> `${file}\n${schema.reduce((line,k)=>`${line}${event[k] ?? ""},`,"")}`,
                schema.join(","));
            const filePath = `${outputDir}/${runInfo.runId ?? "orchestrator"}_${Date.now()}.csv`;
            fs.writeFileSync(
                filePath,
                data);
        }
        this.schema.clear();
        this.error = false;
        this.logs = [];
        return baseFlushP;
    }
    send(event: ITelemetryBaseEvent): void {
        this.baseLogger?.send(event);

        event.Event_Time = Date.now();
        // keep track of the frequency of every log event, as we'll sort by most common on write
        Object.keys(event).forEach((k)=>this.schema.set(k, (this.schema.get(k) ?? 0) + 1));
        if(event.category === "error") {
            this.error = true;
        }
        this.logs.push(event);
    }
}

export const loggerP = new LazyPromise<FileLogger>(async ()=>{
    if (process.env.FLUID_TEST_LOGGER_PKG_PATH) {
        await import(process.env.FLUID_TEST_LOGGER_PKG_PATH);
        const logger = getTestLogger?.();
        assert(logger !== undefined, "Expected getTestLogger to return something");
        return new FileLogger(logger);
    }else{
        return new FileLogger();
    }
});

const codeDetails: IFluidCodeDetails = {
    package: packageName,
    config: {},
};

const createCodeLoader =
    (runId: number | undefined)=> new LocalCodeLoader([[codeDetails, createFluidExport(runId)]]);

export async function initialize(testDriver: ITestDriver) {
    const options = pairwiseLoaderOptions.value[Math.floor(pairwiseLoaderOptions.value.length * Math.random())];
    // Construct the loader
    const loader = new Loader({
        urlResolver: testDriver.createUrlResolver(),
        documentServiceFactory: testDriver.createDocumentServiceFactory(),
        codeLoader: createCodeLoader(undefined),
        logger: ChildLogger.create(await loggerP, undefined, {all: { driverType: testDriver.type }}),
        options,
    });

    const container = await loader.createDetachedContainer(codeDetails);
    container.on("error", (error) => {
        console.log(error);
        process.exit(-1);
    });
    const testId = Date.now().toString();
    const request = testDriver.createCreateNewRequest(testId);
    await container.attach(request);
    container.close();

    return testDriver.createContainerUrl(testId);
}

export async function load(
    testDriver: ITestDriver,
    documentServiceFactory: FaultInjectionDocumentServiceFactory,
    url: string,
    runId: number)
{
    const options = pairwiseLoaderOptions.value[runId % pairwiseLoaderOptions.value.length];
    // Construct the loader
    const loader = new Loader({
        urlResolver: testDriver.createUrlResolver(),
        documentServiceFactory,
        codeLoader: createCodeLoader(runId),
        logger: ChildLogger.create(await loggerP, undefined, {all: { runId, driverType: testDriver.type }}),
        options,
    });

    const container = await loader.resolve({ url });
    return {documentServiceFactory, container, test: await requestFluidObject<ILoadTest>(container,"/")};
}

export async function createTestDriver(driver: TestDriverTypes, runId: number | undefined) {
    const optionsIndex = runId === undefined
        ? Math.floor(pairwiseOdspHostStoragePolicy.value.length * Math.random())
        : runId % pairwiseOdspHostStoragePolicy.value.length;

    return createFluidTestDriver(
        driver,
        {
            odsp: {
                directory: "stress",
                options: pairwiseOdspHostStoragePolicy.value[optionsIndex],
            },
        });
}

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

export async function safeExit(code: number, url: string, runId?: number) {
    // There seems to be at least one dangling promise in ODSP Driver, give it a second to resolve
    await(new Promise((res) => { setTimeout(res, 1000); }));
    // Flush the logs
    await loggerP.then(async (l)=>l.flush({url, runId}));

    process.exit(code);
}
