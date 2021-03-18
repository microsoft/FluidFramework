/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
import { ILoadTestConfig } from "./testConfigFile";

export interface IRunConfig {
    runId: number,
    testConfig: ILoadTestConfig
}

export interface ILoadTest {
    run(config: IRunConfig, reset: boolean): Promise<void>;
}
const wait = async (timeMs: number) => new Promise((resolve) => setTimeout(resolve, timeMs));

const taskManagerKey = "taskManager";
const counterKey = "counter";
const startTimeKey = "startTime";
const taskTimeKey = "taskTime";
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

    private static async waitForCatchup(runtime: IFluidDataStoreRuntime) {
        if(runtime.deltaManager.active) {
            return;
        }
        const lastKnownSeq = runtime.deltaManager.lastKnownSeqNumber;
        while(runtime.deltaManager.lastSequenceNumber < lastKnownSeq) {
            await new Promise((resolve,reject)=>{
                if(runtime.disposed) {
                    reject(new Error("disposed"));
                    return;
                }
                runtime.deltaManager.once("op", resolve);
            });
        }
    }

    public static async createRunnerInstance(
        config: IRunConfig,
        reset: boolean,
        root: ISharedDirectory,
        runtime: IFluidDataStoreRuntime,
    ) {
        if(!root.hasSubDirectory(config.runId.toString())) {
            root.createSubDirectory(config.runId.toString());
        }
        const runDir = root.getSubDirectory(config.runId.toString());
        if(runDir === undefined) {
            throw new Error(`runDir for runId ${config.runId} not available`);
        }

        if(!runDir.has(counterKey)) {
            await LoadTestDataStoreModel.waitForCatchup(runtime);
            if(!runDir.has(counterKey)) {
                runDir.set(counterKey, SharedCounter.create(runtime).handle);
                runDir.set(startTimeKey,Date.now());
            }
        }
        const counter = await runDir.get<IFluidHandle<ISharedCounter>>(counterKey)?.get();
        const taskmanager = await root.wait<IFluidHandle<ITaskManager>>(taskManagerKey).then(async (h)=>h.get());

        if(counter === undefined) {
            throw new Error("counter not available");
        }
        if(taskmanager === undefined) {
            throw new Error("taskmanger not available");
        }

        if(reset) {
            await LoadTestDataStoreModel.waitForCatchup(runtime);
            runDir.set(startTimeKey,Date.now());
            runDir.delete(taskTimeKey);
            counter.increment(-1 * counter.value);
        }

        return new LoadTestDataStoreModel(
            config,
            runtime,
            taskmanager,
            runDir,
            counter,
        );
    }

    private readonly taskId: string;
    private taskStartTime: number =0;

    private constructor(
        private readonly config: IRunConfig,
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly taskManager: ITaskManager,
        private readonly dir: IDirectory,
        public readonly counter: ISharedCounter,
    ) {
        // The runners are paired up and each pair shares a single taskId
        this.taskId = `op_sender${Math.floor(config.runId / 2)}`;
    }

    public get startTime(): number {
        return this.dir.get<number>(startTimeKey) ?? 0;
    }
    public get totalTaskTime(): number {
        return (this.dir.get<number>(taskTimeKey) ?? 0) + this.currentTaskTime;
    }
    public get currentTaskTime(): number {
        return this.haveTaskLock() ? Date.now() - this.taskStartTime : 0;
    }

    public haveTaskLock() {
        try{
            return this.taskManager.haveTaskLock(this.taskId);
        }catch{
            // remove try catch after taskManager fixes
            return false;
        }
    }

    public abandonTask() {
        if(this.haveTaskLock()) {
            try{
                this.taskManager.abandon(this.taskId);
            }catch{
                // remove try catch after taskManager fixes
            }
        }
    }

    public async lockTask() {
        if(!this.haveTaskLock()) {
            if(!this.runtime.connected) {
                await new Promise((res,rej)=>{
                    this.runtime.once("connected",res);
                    this.runtime.once("dispose", rej);
                });
            }
            try{
                await this.taskManager.lockTask(this.taskId);
                this.taskStartTime = Date.now();
                this.taskManager.once("lost",(taskId)=>{
                    if(taskId === this.taskId) {
                        this.dir.set(taskTimeKey, Date.now() - this.taskStartTime);
                        this.taskStartTime = 0;
                    }
                });
            }catch{
                // remove try catch after taskManager fixes
            }
        }
    }

    public printStatus(alwaysPrint: boolean = false) {
        if(alwaysPrint || this.haveTaskLock()) {
            const now = Date.now();
            const totalMin = (now - this.startTime) / 60000;
            const taskMin = this.totalTaskTime / 60000;
            const opCount  = this.runtime.deltaManager.lastKnownSeqNumber;
            const opRate = Math.floor(this.runtime.deltaManager.lastKnownSeqNumber / totalMin);
            const sendRate = Math.floor(this.counter.value / taskMin);
            console.log(
                `${this.config.runId.toString().padStart(3)}>` +
                ` seen: ${opCount.toString().padStart(8)} (${opRate.toString().padStart(4)}/min),` +
                ` sent: ${this.counter.value.toString().padStart(8)} (${sendRate.toString().padStart(2)}/min),` +
                ` run time: ${taskMin.toFixed(2).toString().padStart(5)} min`,
                ` total time: ${totalMin.toFixed(2).toString().padStart(5)} min`,
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
        console.log(`${config.runId.toString().padStart(3)}> begin`);

        const dataModel = await LoadTestDataStoreModel.createRunnerInstance(
            config, reset, this.root, this.runtime);

         // At every moment, we want half the client to be concurrent writers, and start and stop
        // in a rotation fashion for every cycle.
        // To set that up we start each client in a staggered way, each will independently go thru write
        // and listen cycles

        const cycleMs = config.testConfig.readWriteCycleMs;

        console.log(`${config.runId.toString().padStart(3)}> started`);

        let t: NodeJS.Timeout;
        const printProgress = () => {
            dataModel.printStatus();
            t = setTimeout(printProgress, config.testConfig.progressIntervalMs);
        };
        t = setTimeout(printProgress, config.testConfig.progressIntervalMs);

        const clientSendCount = config.testConfig.totalSendCount / config.testConfig.numClients;
        const opsPerCycle = config.testConfig.opRatePerMin * cycleMs / 60000;
        const opsGapMs = cycleMs / opsPerCycle;
        while (dataModel.counter.value < clientSendCount && !this.disposed) {
            if(dataModel.haveTaskLock()) {
                dataModel.counter.increment(1);
                if (dataModel.counter.value % opsPerCycle === 0) {
                    dataModel.abandonTask();
                    await wait(cycleMs);
                }else{
                    // Random jitter of +- 50% of opWaitMs
                    await wait(opsGapMs + opsGapMs * (Math.random() - 0.5));
                }
            }else{
                await dataModel.lockTask();
            }
        }
        dataModel.abandonTask();

        clearTimeout(t);

        dataModel.printStatus(true);
        console.log(`${config.runId.toString().padStart(3)}> finished`);
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

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    LoadTestDataStoreInstantiationFactory,
    new Map([[LoadTestDataStore.DataStoreName, Promise.resolve(LoadTestDataStoreInstantiationFactory)]]),
);
