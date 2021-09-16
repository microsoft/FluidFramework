/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {ISharedCounter, SharedCounter} from "@fluidframework/counter";
import { ITaskManager, TaskManager } from "@fluid-experimental/task-manager";
import { IDirectory, ISharedDirectory } from "@fluidframework/map";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import random from "random-js";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { delay, assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ILoadTestConfig } from "./testConfigFile";

export interface IRunConfig {
    runId: number,
    testConfig: ILoadTestConfig,
    verbose: boolean,
    randEng: random.Engine,
}

export interface ILoadTest {
    run(config: IRunConfig, reset: boolean): Promise<boolean>;
}

const taskManagerKey = "taskManager";
const counterKey = "counter";
const startTimeKey = "startTime";
const taskTimeKey = "taskTime";
const gcDataStoreKey = "dataStore";
const defaultBlobSize = 1024;

/**
 * Encapsulate the data model and to not expose raw DDS to the main loop.
 * Eventually this can spawn isolated sub-dirs for workloads,
 * and provide common abstractions for workload scheduling
 * via task picking.
 */
class LoadTestDataStoreModel {
    public static initializingFirstTime(root: ISharedDirectory, runtime: IFluidDataStoreRuntime) {
        root.set(taskManagerKey, TaskManager.create(runtime).handle);
    }

    private static async waitForCatchup(runtime: IFluidDataStoreRuntime): Promise<void> {
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
        const taskmanager = await root.wait<IFluidHandle<ITaskManager>>(taskManagerKey).then(async (h)=>h.get());

        if (counter === undefined) {
            throw new Error("counter not available");
        }
        if (taskmanager === undefined) {
            throw new Error("taskmanger not available");
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
        );

        if (reset) {
            await LoadTestDataStoreModel.waitForCatchup(runtime);
            runDir.set(startTimeKey,Date.now());
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
    private blobCount = 0;

    public readonly isBlobWriter: boolean = false;

    private constructor(
        private readonly root: ISharedDirectory,
        private readonly config: IRunConfig,
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly taskManager: ITaskManager,
        private readonly dir: IDirectory,
        public readonly counter: ISharedCounter,
        private readonly runDir: IDirectory,
        private readonly gcDataStoreHandle: IFluidHandle,
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

        if (this.config.testConfig.numBlobClients !== undefined) {
            this.isBlobWriter = this.config.runId < this.config.testConfig.numBlobClients;

            // if our partner uploads a blob, download it
            if (this.partnerId < this.config.testConfig.numBlobClients) {
                this.root.on("valueChanged", (v) => {
                    if (v.key === this.blobKey(this.partnerId)) {
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        this.root.get<IFluidHandle>(v.key)?.get();
                    }
                });
            }
        }
    }

    public get startTime(): number {
        return this.dir.get<number>(startTimeKey) ?? Date.now();
    }
    public get totalTaskTime(): number {
        return (this.dir.get<number>(taskTimeKey) ?? 0) + this.currentTaskTime;
    }
    public get currentTaskTime(): number {
        return Date.now() - (this.haveTaskLock() ?  this.taskStartTime : this.startTime);
    }

    private blobKey(id): string { return `blob_${id}`; }

    public async writeBlob() {
        const blobSize = this.config.testConfig.blobSize ?? defaultBlobSize;
        // upload a unique blob, since they may be deduped otherwise
        const buffer = Buffer.alloc(blobSize, `${this.config.runId}/${this.blobCount++}:`);
        assert(buffer.byteLength === blobSize, "incorrect buffer size");
        const handle = await this.runtime.uploadBlob(buffer);
        this.root.set(this.blobKey(this.config.runId), handle);
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

    public haveTaskLock() {
        if (this.runtime.disposed) {
            return false;
        }
        return this.taskManager.haveTaskLock(this.taskId);
    }

    public abandonTask() {
        if (this.haveTaskLock()) {
            // We are becoming the reader. Remove the reference to the GC data store.
            this.runDir.delete(gcDataStoreKey);
            this.taskManager.abandon(this.taskId);
        }
    }

    public async lockTask() {
        if (this.runtime.disposed) {
            return;
        }
        if (!this.haveTaskLock()) {
            try {
                if (!this.runtime.connected) {
                    await new Promise<void>((res,rej) => {
                        const resAndClear = () => {
                            res();
                            this.runtime.off("connected", resAndClear);
                            this.runtime.off("disconnected", rejAndClear);
                            this.runtime.off("dispose", rejAndClear);
                        };
                        const rejAndClear = () => {
                            rej(new Error("failed to connect"));
                            resAndClear();
                        };
                        this.runtime.once("connected", resAndClear);
                        this.runtime.once("dispose", rejAndClear);
                        this.runtime.once("disconnected", rejAndClear);
                    });
                }
                await this.taskManager.lockTask(this.taskId);
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
            const opCount  = this.runtime.deltaManager.lastKnownSeqNumber;
            const opRate = Math.floor(this.runtime.deltaManager.lastKnownSeqNumber / totalMin);
            const sendRate = Math.floor(this.counter.value / taskMin);
            const disposed = this.runtime.disposed;
            const blobsEnabled = (this.config.testConfig.numBlobClients ?? 0) > 0;
            const blobSize = this.config.testConfig.blobSize ?? defaultBlobSize;
            console.log(
                `${this.config.runId.toString().padStart(3)}>` +
                ` seen: ${opCount.toString().padStart(8)} (${opRate.toString().padStart(4)}/min),` +
                ` sent: ${this.counter.value.toString().padStart(8)} (${sendRate.toString().padStart(2)}/min),` +
                ` run time: ${taskMin.toFixed(2).toString().padStart(5)} min`,
                ` total time: ${totalMin.toFixed(2).toString().padStart(5)} min`,
                `hasTask: ${this.haveTaskLock().toString().padStart(5)}`,
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
        LoadTestDataStoreModel.initializingFirstTime(
            this.root,
            this.runtime);
    }

    public async run(config: IRunConfig, reset: boolean) {
        const dataModel = await LoadTestDataStoreModel.createRunnerInstance(
            config, reset, this.root, this.runtime, this.context.containerRuntime);

        let timeout: NodeJS.Timeout | undefined;
        if (config.verbose) {
            const printProgress = () => {
                dataModel.printStatus();
                timeout = setTimeout(printProgress, config.testConfig.progressIntervalMs);
            };
            timeout = setTimeout(printProgress, config.testConfig.progressIntervalMs);
        }

        // At every moment, we want half the clients to be concurrent writers, and switch every cycle.
        // To set that up we pair each client with another, and half of the clients will wait for their partner to
        // finish before writing.
        const cycleMs = config.testConfig.readWriteCycleMs;
        const clientSendCount = config.testConfig.totalSendCount / config.testConfig.numClients;
        const opsPerCycle = config.testConfig.opRatePerMin * cycleMs / 60000;
        const opsGapMs = cycleMs / opsPerCycle;
        try {
            let blobP: Promise<void> | undefined;
            while (dataModel.counter.value < clientSendCount && !this.disposed) {
                // this enables a quick ramp down. due to restart, some clients can lag
                // leading to a slow ramp down. so if there are fewer than half the clients
                // and our partner is done, return true to complete the runner.
                if (this.runtime.getAudience().getMembers().size < config.testConfig.numClients / 2
                    && ((await dataModel.getPartnerCounter())?.value ?? 0) >= clientSendCount) {
                    return true;
                }

                if (dataModel.haveTaskLock()) {
                    dataModel.counter.increment(1);

                    // write a blob once per cycle
                    if (dataModel.isBlobWriter && !blobP) {
                        blobP = dataModel.writeBlob();
                    }
                    if (dataModel.counter.value % opsPerCycle === 0) {
                        if (blobP) {
                            await blobP;
                            blobP = undefined;
                        }
                        dataModel.abandonTask();
                        // give our partner a half cycle to get the task
                        await delay(cycleMs / 2);
                    } else {
                        // Random jitter of +- 50% of opWaitMs
                        await delay(opsGapMs + opsGapMs * random.real(0, .5, true)(config.randEng));
                    }
                } else {
                    await dataModel.lockTask();
                }
            }
            return !this.runtime.disposed;
        } finally {
            if (timeout !== undefined) {
                clearTimeout(timeout);
            }
            dataModel.printStatus();
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

export const createFluidExport = (options: IContainerRuntimeOptions) =>
    new ContainerRuntimeFactoryWithDefaultDataStore(
        LoadTestDataStoreInstantiationFactory,
        new Map([[LoadTestDataStore.DataStoreName, Promise.resolve(LoadTestDataStoreInstantiationFactory)]]),
        undefined,
        undefined,
        options,
    );
