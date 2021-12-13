/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import crypto from "crypto";
import fs from "fs";
import random from "random-js";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { assert, LazyPromise } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { Container, IDetachedBlobStorage, Loader } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { ICreateBlobResponse } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
import { ITelemetryBufferedLogger, ITestDriver, TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { createFluidTestDriver, generateOdspHostStoragePolicy, OdspTestDriver } from "@fluidframework/test-drivers";
import { LocalCodeLoader } from "@fluidframework/test-utils";
import { createFluidExport, ILoadTest } from "./loadTestDataStore";
import { generateLoaderOptions, generateRuntimeOptions } from "./optionsMatrix";
import { pkgName, pkgVersion } from "./packageVersion";
import { ILoadTestConfig, ITestConfig } from "./testConfigFile";

const packageName = `${pkgName}@${pkgVersion}`;

class FileLogger extends TelemetryLogger implements ITelemetryBufferedLogger {
    private error: boolean = false;
    private readonly schema = new Map<string, number>();
    private logs: ITelemetryBaseEvent[] = [];

    public constructor(private readonly baseLogger?: ITelemetryBufferedLogger) {
        super();
    }

    async flush(runInfo?: { url: string, runId?: number }): Promise<void> {
        const baseFlushP = this.baseLogger?.flush();

        if (this.error && runInfo !== undefined) {
            const logs = this.logs;
            const outputDir = `${__dirname}/output/${crypto.createHash("md5").update(runInfo.url).digest("hex")}`;
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            // sort from most common column to least common
            const schema = [...this.schema].sort((a, b) => b[1] - a[1]).map((v) => v[0]);
            const data = logs.reduce(
                (file, event) => `${file}\n${schema.reduce((line, k) => `${line}${event[k] ?? ""},`, "")}`,
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
        this.baseLogger?.send({ ...event, hostName: pkgName });

        event.Event_Time = Date.now();
        // keep track of the frequency of every log event, as we'll sort by most common on write
        Object.keys(event).forEach((k) => this.schema.set(k, (this.schema.get(k) ?? 0) + 1));
        if (event.category === "error") {
            this.error = true;
        }
        this.logs.push(event);
    }
}

export const loggerP = new LazyPromise<FileLogger>(async () => {
    if (process.env.FLUID_TEST_LOGGER_PKG_PATH !== undefined) {
        await import(process.env.FLUID_TEST_LOGGER_PKG_PATH);
        const logger = getTestLogger?.();
        assert(logger !== undefined, "Expected getTestLogger to return something");
        return new FileLogger(logger);
    } else {
        return new FileLogger();
    }
});

const codeDetails: IFluidCodeDetails = {
    package: packageName,
    config: {},
};

export const createCodeLoader =
    (options: IContainerRuntimeOptions) =>
        new LocalCodeLoader([[codeDetails, createFluidExport(options)]]);

class MockDetachedBlobStorage implements IDetachedBlobStorage {
    public readonly blobs = new Map<string, ArrayBufferLike>();

    public get size() { return this.blobs.size; }

    public getBlobIds(): string[] {
        return Array.from(this.blobs.keys());
    }

    public async createBlob(content: ArrayBufferLike): Promise<ICreateBlobResponse> {
        const id = this.size.toString();
        this.blobs.set(id, content);
        return { id, url: "" };
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        const blob = this.blobs.get(blobId);
        assert(!!blob, "blob not found");
        return blob;
    }
}

export async function initialize(testDriver: ITestDriver, seed: number, testConfig: ILoadTestConfig, verbose: boolean) {
    const randEng = random.engines.mt19937();
    randEng.seed(seed);
    const loaderOptions = random.pick(
        randEng,
        generateLoaderOptions(seed, testConfig.optionOverrides?.[testDriver.type]?.loader));
    const containerOptions = random.pick(
        randEng,
        generateRuntimeOptions(seed, testConfig.optionOverrides?.[testDriver.type]?.container));
    // Construct the loader
    const loader = new Loader({
        urlResolver: testDriver.createUrlResolver(),
        documentServiceFactory: testDriver.createDocumentServiceFactory(),
        codeLoader: createCodeLoader(containerOptions),
        logger: ChildLogger.create(await loggerP, undefined,
            {
                all: {
                    driverType: testDriver.type,
                    driverEndpointName: testDriver.endpointName,
                },
            }),
        options: loaderOptions,
        detachedBlobStorage: new MockDetachedBlobStorage(),
    });

    const container: IContainer = await loader.createDetachedContainer(codeDetails);
    (container as Container).on("error", (error) => {
        console.log(error);
        process.exit(-1);
    });

    if ((testConfig.detachedBlobCount ?? 0) > 0) {
        assert(testDriver.type === "odsp", "attachment blobs in detached container not supported on this service");
        const ds = await requestFluidObject<ILoadTest>(container, "/");
        const dsm = await ds.detached({ testConfig, verbose, randEng });
        await Promise.all([...Array(testConfig.detachedBlobCount).keys()].map(async (i) => dsm.writeBlob(i)));
    }

    const testId = Date.now().toString();
    const request = testDriver.createCreateNewRequest(testId);
    await container.attach(request);
    container.close();

    if ((testConfig.detachedBlobCount ?? 0) > 0) {
        // TODO: #7684 this should be driver-agnostic
        const url = (testDriver as OdspTestDriver).getUrlFromItemId((container.resolvedUrl as any).itemId);
        return url;
    }
    return testDriver.createContainerUrl(testId);
}

export async function createTestDriver(
    driver: TestDriverTypes, seed: number, runId: number | undefined, supportsBrowserAuth?: true) {
    const options = generateOdspHostStoragePolicy(seed);
    return createFluidTestDriver(
        driver,
        {
            odsp: {
                directory: "stress",
                options: options[(runId ?? seed) % options.length],
                supportsBrowserAuth,
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
    await (new Promise((res) => { setTimeout(res, 1000); }));
    // Flush the logs
    await loggerP.then(async (l) => l.flush({ url, runId }));

    process.exit(code);
}
