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
import { delay } from "@fluidframework/common-utils";
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

/**
 * Encapsulate the data model and to not expose raw DSS to the main loop.
 * Eventually this can  spawn isolated sub-dirs for workloads,
 * and provide common abstractions for workload scheduling
 * via task picking.
 */
class LoadTestDataStoreModel {
    public static initializingFirstTime(root: ISharedDirectory, runtime: IFluidDataStoreRuntime) {
        root.set(taskManagerKey, TaskManager.create(runtime).handle);
    }

    private static async waitForCatchup(runtime: IFluidDataStoreRuntime): Promise<void> {
        if(runtime.deltaManager.active) {
            return;
        }

        const lastKnownSeq = runtime.deltaManager.lastKnownSeqNumber;

        return new Promise<void>((resolve, reject) => {
            if (runtime.disposed) {
                reject(new Error("disposed"));
            }

            const opListener = () => {
                if (runtime.deltaManager.lastSequenceNumber >= lastKnownSeq) {
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
     * and removes the reference before it transtions to a reader.
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

        if(!root.hasSubDirectory(config.runId.toString())) {
            root.createSubDirectory(config.runId.toString());
        }
        const runDir = root.getSubDirectory(config.runId.toString());
        if(runDir === undefined) {
            throw new Error(`runDir for runId ${config.runId} not available`);
        }

        if(!runDir.has(counterKey)) {
            runDir.set(counterKey, SharedCounter.create(runtime).handle);
            runDir.set(startTimeKey,Date.now());
        }
        const counter = await runDir.get<IFluidHandle<ISharedCounter>>(counterKey)?.get();
        const taskmanager = await root.wait<IFluidHandle<ITaskManager>>(taskManagerKey).then(async (h)=>h.get());

        if(counter === undefined) {
            throw new Error("counter not available");
        }
        if(taskmanager === undefined) {
            throw new Error("taskmanger not available");
        }

        const gcDataStore = await this.getGCDataStore(config, root, containerRuntime);

        const dataModel =  new LoadTestDataStoreModel(
            root,
            config,
            runtime,
            taskmanager,
            runDir,
            counter,
            runDir,
            gcDataStore.handle,
        );

        if(reset) {
            await LoadTestDataStoreModel.waitForCatchup(runtime);
            runDir.set(startTimeKey,Date.now());
            runDir.delete(taskTimeKey);
            counter.increment(-1 * counter.value);
            const partnerCounter = await dataModel.getPartnerCounter();
            if(partnerCounter !== undefined && partnerCounter.value > 0) {
                partnerCounter.increment(-1 * partnerCounter.value);
            }
        }
        return dataModel;
    }

    private readonly taskId: string;
    private readonly partnerId: number;
    private taskStartTime: number =0;

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
        const changed = (taskId)=>{
            if(taskId === this.taskId && this.taskStartTime !== 0) {
                this.dir.set(taskTimeKey, this.totalTaskTime);
                this.taskStartTime = 0;
            }
        };
        this.taskManager.on("lost", changed);
        this.taskManager.on("assigned", changed);
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

    public async getPartnerCounter() {
        if(this.runtime.disposed) {
            return undefined;
        }
        const dir = this.root.getSubDirectory(this.partnerId.toString());
        if(dir === undefined) {
            return undefined;
        }
        const handle = dir.get<IFluidHandle<ISharedCounter>>(counterKey);
        if(handle === undefined) {
            return undefined;
        }
        return handle.get();
    }

    public haveTaskLock() {
        if(this.runtime.disposed) {
            return false;
        }
        return this.taskManager.haveTaskLock(this.taskId);
    }

    public abandonTask() {
        if(this.haveTaskLock()) {
            // We are becoming the reader. Remove the reference to the GC data store.
            this.runDir.delete(gcDataStoreKey);
            this.taskManager.abandon(this.taskId);
        }
    }

    public async lockTask() {
        if(this.runtime.disposed) {
            return;
        }
        if(!this.haveTaskLock()) {
            try{
                if(!this.runtime.connected) {
                    await new Promise<void>((res,rej)=>{
                        const resAndClear = ()=>{
                            res();
                            this.runtime.off("connected", resAndClear);
                            this.runtime.off("disconnected", rejAndClear);
                            this.runtime.off("dispose", rejAndClear);
                        };
                        const rejAndClear = ()=>{
                            rej(new Error("failed to connect"));
                            resAndClear();
                        };
                        this.runtime.once("connected",resAndClear);
                        this.runtime.once("dispose",rejAndClear);
                        this.runtime.once("disconnected",rejAndClear);
                    });
                }
                await this.taskManager.lockTask(this.taskId);
                this.taskStartTime = Date.now();

                // We just became the writer. Add a reference to the GC data store.
                if (!this.runDir.has(gcDataStoreKey)) {
                    this.runDir.set(gcDataStoreKey, this.gcDataStoreHandle);
                }
            }catch(e) {
                if(this.runtime.disposed || !this.runtime.connected) {
                    return;
                }
                throw e;
            }
        }
    }

    public printStatus() {
        if(this.config.verbose) {
            const now = Date.now();
            const totalMin = (now - this.startTime) / 60000;
            const taskMin = this.totalTaskTime / 60000;
            const opCount  = this.runtime.deltaManager.lastKnownSeqNumber;
            const opRate = Math.floor(this.runtime.deltaManager.lastKnownSeqNumber / totalMin);
            const sendRate = Math.floor(this.counter.value / taskMin);
            const disposed = this.runtime.disposed;
            console.log(
                `${this.config.runId.toString().padStart(3)}>` +
                ` seen: ${opCount.toString().padStart(8)} (${opRate.toString().padStart(4)}/min),` +
                ` sent: ${this.counter.value.toString().padStart(8)} (${sendRate.toString().padStart(2)}/min),` +
                ` run time: ${taskMin.toFixed(2).toString().padStart(5)} min`,
                ` total time: ${totalMin.toFixed(2).toString().padStart(5)} min`,
                `hasTask: ${this.haveTaskLock()}`,
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

         // At every moment, we want half the client to be concurrent writers, and start and stop
        // in a rotation fashion for every cycle.
        // To set that up we start each client in a staggered way, each will independently go thru write
        // and listen cycles

        const cycleMs = config.testConfig.readWriteCycleMs;
        let t: NodeJS.Timeout | undefined;
        if(config.verbose) {
            const printProgress = () => {
                dataModel.printStatus();
                t = setTimeout(printProgress, config.testConfig.progressIntervalMs);
            };
            t = setTimeout(printProgress, config.testConfig.progressIntervalMs);
        }

        const clientSendCount = config.testConfig.totalSendCount / config.testConfig.numClients;
        const opsPerCycle = config.testConfig.opRatePerMin * cycleMs / 60000;
        const opsGapMs = cycleMs / opsPerCycle;
        try{
            while (dataModel.counter.value < clientSendCount && !this.disposed) {
                // this enables a quick ramp down. due to restart, some clients can lag
                // leading to a slow ramp down. so if there are less than half the clients
                // and it's partner is done, return true to complete the runner.
                if(this.runtime.getAudience().getMembers().size < config.testConfig.numClients / 2
                    && ((await dataModel.getPartnerCounter())?.value ?? 0) >= clientSendCount) {
                    return true;
                }

                if(dataModel.haveTaskLock()) {
                    dataModel.counter.increment(1);
                    if (dataModel.counter.value % opsPerCycle === 0) {
                        console.log(`runId=${config.runId} Waiting for partner`);
                        dataModel.abandonTask();
                        // give our partner a half cycle to get the task
                        await delay(cycleMs / 2);
                    }else{
                        // Random jitter of +- 50% of opWaitMs
                        await delay(opsGapMs + opsGapMs * random.real(0,.5,true)(config.randEng));
                    }
                }else{
                    await dataModel.lockTask();
                }
            }
            return !this.runtime.disposed;
        }finally{
            if(t !== undefined) {
                clearTimeout(t);
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
