/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { ISharedCounter, SharedCounter } from "@fluidframework/counter";
import { ITaskManager, TaskManager } from "@fluid-experimental/task-manager";
import { IDirectory, ISharedDirectory } from "@fluidframework/map";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import random from "random-js";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { delay, assert } from "@fluidframework/common-utils";
import { TelemetryLogger } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ILoadTestConfig } from "./testConfigFile";
import { LeaderElection } from "./leaderElection";

export interface IRunConfig {
    runId: number;
    testConfig: ILoadTestConfig;
    verbose: boolean;
    randEng: random.Engine;
}

export interface ILoadTest {
    run(config: IRunConfig, reset: boolean, logger): Promise<boolean>;
    detached(config: Omit<IRunConfig, "runId">, logger): Promise<LoadTestDataStoreModel>;
    getRuntime(): Promise<IFluidDataStoreRuntime>;
}

const taskManagerKey = "taskManager";
const counterKey = "counter";
const startTimeKey = "startTime";
const taskTimeKey = "taskTime";
const gcDataStoreKey = "dataStore";
const defaultBlobSize = 1024;

/**
 * Encapsulate the data model and to not expose raw DSS to the main loop.
 * Eventually this can  spawn isolated sub-dirs for workloads,
 * and provide common abstractions for workload scheduling
 * via task picking.
 */
export class LoadTestDataStoreModel {
    private static async waitForCatchup(runtime: IFluidDataStoreRuntime): Promise<void> {
        if (!runtime.connected) {
            await new Promise<void>((resolve, reject) => {
                const connectListener = () => {
                    runtime.off("dispose", disposeListener);
                    resolve();
                };
                const disposeListener = () => {
                    runtime.off("connected", connectListener);
                    reject(new Error("disposed"));
                };

                runtime.once("connected", connectListener);
                runtime.once("dispose", disposeListener);
            });
        }
        const lastKnownSeq = runtime.deltaManager.lastKnownSeqNumber;
        assert(runtime.deltaManager.lastSequenceNumber <= lastKnownSeq,
            "lastKnownSeqNumber should never be below last processed sequence number");
        if (runtime.deltaManager.lastSequenceNumber === lastKnownSeq) {
            return;
        }

        return new Promise<void>((resolve, reject) => {
            if (runtime.disposed) {
                reject(new Error("disposed"));
            }

            const opListener = (op: ISequencedDocumentMessage) => {
                if (lastKnownSeq <= op.sequenceNumber) {
                    runtime.deltaManager.off("op", opListener);
                    runtime.off("dispose", disposeListener);
                    resolve();
                }
            };

            const disposeListener = () => {
                runtime.deltaManager.off("op", opListener);
                runtime.off("dispose", disposeListener);
                reject(new Error("disposed"));
            };

            runtime.deltaManager.on("op", opListener);
            runtime.on("dispose", disposeListener);
        });
    }

    /**
     * For GC testing - We create a data store for each client pair. The url of the data store is stored in a key
     * common to both the clients. Each client adds a reference to this data store when it becomes a writer
     * and removes the reference before it transitions to a reader.
     * So, at any point in time, the data store can have 0, 1 or 2 references.
     */
    private static async getGCDataStore(
        config: IRunConfig,
        root: ISharedDirectory,
        containerRuntime: IContainerRuntimeBase,
    ): Promise<LoadTestDataStore> {
        const halfClients = Math.floor(config.testConfig.numClients / 2);
        const gcDataStoreIdKey = `gc_dataStore_${config.runId % halfClients}`;
        let gcDataStore: LoadTestDataStore | undefined;
        if (!root.has(gcDataStoreIdKey)) {
            // The data store for this pair doesn't exist, create it and store its url.
            gcDataStore = await LoadTestDataStoreInstantiationFactory.createInstance(containerRuntime);
            // Force the new data store to be attached.
            root.set("Fake", gcDataStore.handle);
            root.delete("Fake");
            root.set(gcDataStoreIdKey, gcDataStore.id);
        }
        // If we did not create the data store above, load it by getting its url.
        if (gcDataStore === undefined) {
            const gcDataStoreId = root.get(gcDataStoreIdKey);
            const response = await containerRuntime.request({ url: `/${gcDataStoreId}` });
            if (response.status !== 200 || response.mimeType !== "fluid/object") {
                throw new Error("GC data store not available");
            }
            gcDataStore = response.value as LoadTestDataStore;
        }
        return gcDataStore;
    }

    public static async createRunnerInstance(
        config: IRunConfig,
        reset: boolean,
        root: ISharedDirectory,
        runtime: IFluidDataStoreRuntime,
        containerRuntime: IContainerRuntimeBase,
        logger: TelemetryLogger,
    ) {
        await LoadTestDataStoreModel.waitForCatchup(runtime);

        if (!root.hasSubDirectory(config.runId.toString())) {
            root.createSubDirectory(config.runId.toString());
        }
        const runDir = root.getSubDirectory(config.runId.toString());
        if (runDir === undefined) {
            throw new Error(`runDir for runId ${config.runId} not available`);
        }

        if (!runDir.has(counterKey)) {
            runDir.set(counterKey, SharedCounter.create(runtime).handle);
            runDir.set(startTimeKey, Date.now());
        }
        const counter = await runDir.get<IFluidHandle<ISharedCounter>>(counterKey)?.get();
        const taskmanager = await root.get<IFluidHandle<ITaskManager>>(taskManagerKey)?.get();

        if (counter === undefined) {
            throw new Error("counter not available");
        }
        if (taskmanager === undefined) {
            throw new Error("taskmanager not available");
        }

        const gcDataStore = await this.getGCDataStore(config, root, containerRuntime);

        const dataModel = new LoadTestDataStoreModel(
            root,
            config,
            runtime,
            taskmanager,
            runDir,
            counter,
            runDir,
            gcDataStore.handle,
            logger,
        );

        if (reset) {
            await LoadTestDataStoreModel.waitForCatchup(runtime);
            runDir.set(startTimeKey, Date.now());
            runDir.delete(taskTimeKey);
            counter.increment(-1 * counter.value);
            const partnerCounter = await dataModel.getPartnerCounter();
            if (partnerCounter !== undefined && partnerCounter.value > 0) {
                partnerCounter.increment(-1 * partnerCounter.value);
            }
        }
        return dataModel;
    }

    private readonly taskId: string;
    private readonly partnerId: number;
    private taskStartTime: number = 0;

    private readonly isBlobWriter: boolean;
    private readonly blobUploads: Promise<void>[] = [];
    private blobCount = 0;

    private constructor(
        private readonly root: ISharedDirectory,
        private readonly config: IRunConfig,
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly taskManager: ITaskManager,
        private readonly dir: IDirectory,
        public readonly counter: ISharedCounter,
        private readonly runDir: IDirectory,
        private readonly gcDataStoreHandle: IFluidHandle,
        private readonly logger: TelemetryLogger,
    ) {
        const halfClients = Math.floor(this.config.testConfig.numClients / 2);
        // The runners are paired up and each pair shares a single taskId
        this.taskId = `op_sender${config.runId % halfClients}`;
        this.partnerId = (this.config.runId + halfClients) % this.config.testConfig.numClients;
        const changed = (taskId) => {
            if (taskId === this.taskId && this.taskStartTime !== 0) {
                this.dir.set(taskTimeKey, this.totalTaskTime);
                this.taskStartTime = 0;
            }
        };
        this.taskManager.on("lost", changed);
        this.taskManager.on("assigned", changed);

        // calculate the number of blobs we will upload
        const clientBlobCount = Math.trunc((config.testConfig.totalBlobCount ?? 0) / config.testConfig.numClients) +
            (this.config.runId < ((config.testConfig.totalBlobCount ?? 0) % config.testConfig.numClients) ? 1 : 0);
        this.isBlobWriter = clientBlobCount > 0;
        if (this.isBlobWriter) {
            const clientOpCount = config.testConfig.totalSendCount / config.testConfig.numClients;
            const blobsPerOp = clientBlobCount / clientOpCount;

            // start uploading blobs where we left off
            this.blobCount = Math.trunc(this.counter.value * blobsPerOp);

            // upload blobs progressively as the counter is incremented
            this.counter.on("op", (_, local) => {
                const value = this.counter.value;
                if (!local) {
                    // this is an old op, we should have already uploaded this blob
                    this.blobCount = Math.max(this.blobCount, Math.trunc(value * blobsPerOp));
                    return;
                }
                const newBlobs = value >= clientOpCount
                    ? clientBlobCount - this.blobCount
                    : Math.trunc(value * blobsPerOp - this.blobCount);

                if (newBlobs > 0) {
                    this.blobUploads.push(...[...Array(newBlobs)].map(async () => this.writeBlob(this.blobCount++)));
                }
            });
        }

        // download any blobs our partner may upload
        const partnerBlobCount = Math.trunc(config.testConfig.totalBlobCount ?? 0 / config.testConfig.numClients) +
            (this.partnerId < (config.testConfig.totalBlobCount ?? 0 % config.testConfig.numClients) ? 1 : 0);

        const readBlob = (key: string) => {
            if (key.startsWith(this.partnerBlobKeyPrefix)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.root.get<IFluidHandle>(key)!.get().catch((error) => {
                    this.logger.sendErrorEvent({
                        eventName: "ReadBlobFailed_OnValueChanged",
                        key,
                    }, error);
                });
            }
        };
        if (partnerBlobCount > 0) {
            this.root.on("valueChanged", (v) => readBlob(v.key));
        }
        // additional loop of readBlob in case the eventlistener won't fire when container is closed.
        for (const key of this.root.keys()) {
            readBlob(key);
        }
    }

    public get startTime(): number {
        return this.dir.get<number>(startTimeKey) ?? Date.now();
    }
    public get totalTaskTime(): number {
        return (this.dir.get<number>(taskTimeKey) ?? 0) + this.currentTaskTime;
    }
    public get currentTaskTime(): number {
        return Date.now() - (this.assigned() ? this.taskStartTime : this.startTime);
    }

    private blobKey(id): string { return `blob_${this.config.runId}_${id}`; }
    private get partnerBlobKeyPrefix(): string { return `blob_${this.partnerId}_`; }

    public async blobFinish() {
        const p = Promise.all(this.blobUploads);
        this.blobUploads.length = 0;
        return p;
    }

    /**
     * Upload a unique attachment blob and store the handle in a unique key on the root map
     */
    public async writeBlob(blobNumber: number) {
        if (this.runtime.disposed) {
            return;
        }
        const blobSize = this.config.testConfig.blobSize ?? defaultBlobSize;
        // upload a unique blob, since they may be deduped otherwise
        const buffer = Buffer.alloc(blobSize, `${this.config.runId}/${blobNumber}:`);
        assert(buffer.byteLength === blobSize, "incorrect buffer size");
        const handle = await this.runtime.uploadBlob(buffer);
        if (!this.runtime.disposed) {
            this.root.set(this.blobKey(blobNumber), handle);
        }
    }

    public async getPartnerCounter() {
        if (this.runtime.disposed) {
            return undefined;
        }
        const dir = this.root.getSubDirectory(this.partnerId.toString());
        if (dir === undefined) {
            return undefined;
        }
        const handle = dir.get<IFluidHandle<ISharedCounter>>(counterKey);
        if (handle === undefined) {
            return undefined;
        }
        return handle.get();
    }

    public assigned() {
        if (this.runtime.disposed) {
            return false;
        }
        return this.taskManager.assigned(this.taskId);
    }

    public abandonTask() {
        if (this.assigned()) {
            // We are becoming the reader. Remove the reference to the GC data store.
            this.runDir.delete(gcDataStoreKey);
            this.taskManager.abandon(this.taskId);
        }
    }

    public async volunteerForTask() {
        if (this.runtime.disposed) {
            return;
        }
        if (!this.assigned()) {
            try {
                if (!this.runtime.connected) {
                    await new Promise<void>((resolve, reject) => {
                        const resAndClear = () => {
                            resolve();
                            this.runtime.off("connected", resAndClear);
                            this.runtime.off("disconnected", rejAndClear);
                            this.runtime.off("dispose", rejAndClear);
                        };
                        const rejAndClear = () => {
                            reject(new Error("failed to connect"));
                            resAndClear();
                        };
                        this.runtime.once("connected", resAndClear);
                        this.runtime.once("dispose", rejAndClear);
                        this.runtime.once("disconnected", rejAndClear);
                    });
                }
                await this.taskManager.volunteerForTask(this.taskId);
                this.taskStartTime = Date.now();

                // We just became the writer. Add a reference to the GC data store.
                if (!this.runDir.has(gcDataStoreKey)) {
                    this.runDir.set(gcDataStoreKey, this.gcDataStoreHandle);
                }
            } catch (e) {
                if (this.runtime.disposed || !this.runtime.connected) {
                    return;
                }
                throw e;
            }
        }
    }

    public printStatus() {
        if (this.config.verbose) {
            const formatBytes = (bytes: number, decimals = 1): string => {
                if (bytes === 0) { return "0 B"; }
                const i = Math.floor(Math.log(bytes) / Math.log(1024));
                return `${(bytes / Math.pow(1024, i)).toFixed(decimals)} ${" KMGTPEZY"[i]}B`;
            };
            const now = Date.now();
            const totalMin = (now - this.startTime) / 60000;
            const taskMin = this.totalTaskTime / 60000;
            const opCount = this.runtime.deltaManager.lastKnownSeqNumber;
            const opRate = Math.floor(this.runtime.deltaManager.lastKnownSeqNumber / totalMin);
            const sendRate = Math.floor(this.counter.value / taskMin);
            const disposed = this.runtime.disposed;
            const blobsEnabled = (this.config.testConfig.totalBlobCount ?? 0) > 0;
            const blobSize = this.config.testConfig.blobSize ?? defaultBlobSize;
            console.log(
                `${this.config.runId.toString().padStart(3)}>` +
                ` seen: ${opCount.toString().padStart(8)} (${opRate.toString().padStart(4)}/min),` +
                ` sent: ${this.counter.value.toString().padStart(8)} (${sendRate.toString().padStart(2)}/min),` +
                ` run time: ${taskMin.toFixed(2).toString().padStart(5)} min`,
                ` total time: ${totalMin.toFixed(2).toString().padStart(5)} min`,
                `hasTask: ${this.assigned().toString().padStart(5)}`,
                blobsEnabled ? `blobWriter: ${this.isBlobWriter.toString().padStart(5)}` : "",
                blobsEnabled ? `blobs uploaded: ${formatBytes(this.blobCount * blobSize).padStart(8)}` : "",
                !disposed ? `audience: ${this.runtime.getAudience().getMembers().size}` : "",
                !disposed ? `quorum: ${this.runtime.getQuorum().getMembers().size}` : "",
            );
        }
    }
}

class LoadTestDataStore extends DataObject implements ILoadTest {
    public static DataStoreName = "StressTestDataStore";

    protected async initializingFirstTime() {
        this.root.set(taskManagerKey, TaskManager.create(this.runtime).handle);
    }

    public async detached(config: Omit<IRunConfig, "runId">, logger) {
        return LoadTestDataStoreModel.createRunnerInstance(
            { ...config, runId: -1 },
            false,
            this.root,
            this.runtime,
            this.context.containerRuntime,
            logger,
        );
    }

    public async run(config: IRunConfig, reset: boolean, logger: TelemetryLogger) {
        const dataModel = await LoadTestDataStoreModel.createRunnerInstance(
            config, reset, this.root, this.runtime, this.context.containerRuntime, logger);

        const leaderElection = new LeaderElection(this.runtime);
        leaderElection.setupLeaderElection();

        // At every moment, we want half the client to be concurrent writers, and start and stop
        // in a rotation fashion for every cycle.
        // To set that up we start each client in a staggered way, each will independently go thru write
        // and listen cycles

        let timeout: NodeJS.Timeout | undefined;
        if (config.verbose) {
            const printProgress = () => {
                dataModel.printStatus();
                timeout = setTimeout(printProgress, config.testConfig.progressIntervalMs);
            };
            timeout = setTimeout(printProgress, config.testConfig.progressIntervalMs);
        }

        let runResult: [boolean, void];
        try {
            const opsRun = this.sendOps(dataModel, config);
            const signalsRun = this.sendSignals(config);
            // runResult is of type [boolean, void] as we return boolean for Ops alone based on runtime.disposed value
            runResult = await Promise.all([opsRun, signalsRun]);
        } finally {
            if (timeout !== undefined) {
                clearTimeout(timeout);
            }
        }
        return runResult[0];
    }

    async getRuntime() {
        return this.runtime;
    }

    async sendOps(dataModel: LoadTestDataStoreModel, config: IRunConfig) {
        const cycleMs = config.testConfig.readWriteCycleMs;
        const clientSendCount = config.testConfig.totalSendCount / config.testConfig.numClients;
        const opsPerCycle = config.testConfig.opRatePerMin * cycleMs / 60000;
        const opsGapMs = cycleMs / opsPerCycle;
        try {
            while (dataModel.counter.value < clientSendCount && !this.disposed) {
                // this enables a quick ramp down. due to restart, some clients can lag
                // leading to a slow ramp down. so if there are less than half the clients
                // and it's partner is done, return true to complete the runner.
                if (this.runtime.getAudience().getMembers().size < config.testConfig.numClients / 2
                    && ((await dataModel.getPartnerCounter())?.value ?? 0) >= clientSendCount) {
                    return true;
                }

                if (dataModel.assigned()) {
                    dataModel.counter.increment(1);
                    if (dataModel.counter.value % opsPerCycle === 0) {
                        await dataModel.blobFinish();
                        dataModel.abandonTask();
                        // give our partner a half cycle to get the task
                        await delay(cycleMs / 2);
                    } else {
                        // Random jitter of +- 50% of opWaitMs
                        await delay(opsGapMs + opsGapMs * random.real(0, .5, true)(config.randEng));
                    }
                } else {
                    await dataModel.volunteerForTask();
                }
            }
            return !this.runtime.disposed;
        } finally {
            dataModel.printStatus();
        }
    }

    async sendSignals(config: IRunConfig) {
        const clientSignalsSendCount = (typeof config.testConfig.totalSignalsSendCount === "undefined") ?
                                        0 : config.testConfig.totalSignalsSendCount / config.testConfig.numClients;
        const cycleMs = config.testConfig.readWriteCycleMs;
        const signalsPerCycle = (typeof config.testConfig.signalsPerMin === "undefined") ?
                                 0 : config.testConfig.signalsPerMin * cycleMs / 60000;
        const signalsGapMs = cycleMs / signalsPerCycle;
        let submittedSignals = 0;
        try {
            while (submittedSignals < clientSignalsSendCount && !this.runtime.disposed) {
                // all the clients are sending signals;
                // with signals, there is no particular need to have staggered writers and readers
                if (this.runtime.connected) {
                    this.runtime.submitSignal("generic-signal", true);
                    submittedSignals++;
                }
                // Random jitter of +- 50% of signalGapMs
                await delay(signalsGapMs + signalsGapMs * random.real(0, .5, true)(config.randEng));
            }
        } catch (e) {
            console.error("Error during submitting signals: ", e);
        }
    }
}

const LoadTestDataStoreInstantiationFactory = new DataObjectFactory(
    LoadTestDataStore.DataStoreName,
    LoadTestDataStore,
    [
        SharedCounter.getFactory(),
        TaskManager.getFactory(),
    ],
    {},
);

const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
    runtime.IFluidHandleContext.resolveHandle(request);

export const createFluidExport = (options: IContainerRuntimeOptions) =>
    new ContainerRuntimeFactoryWithDefaultDataStore(
        LoadTestDataStoreInstantiationFactory,
        new Map([[LoadTestDataStore.DataStoreName, Promise.resolve(LoadTestDataStoreInstantiationFactory)]]),
        undefined,
        [innerRequestHandler],
        options,
    );
