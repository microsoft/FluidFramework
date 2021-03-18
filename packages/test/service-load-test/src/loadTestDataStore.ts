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
    run(config: IRunConfig): Promise<void>;
}
const wait = async (timeMs: number) => new Promise((resolve) => setTimeout(resolve, timeMs));

class LoadTestDataStoreModel {
    public static initializingFirstTime(root: ISharedDirectory, runtime: IFluidDataStoreRuntime) {
        root.set("taskmanager", TaskManager.create(runtime).handle);
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
            throw new Error("runDir not available");
        }

        if(!runDir.has("counter")) {
            await LoadTestDataStoreModel.waitForCatchup(runtime);
            if(!runDir.has("counter")) {
                runDir.set("counter", SharedCounter.create(runtime).handle);
                runDir.set("startTime",Date.now());
            }
        }
        const counter = await runDir.get<IFluidHandle<ISharedCounter>>("counter")?.get();
        const taskmanager = await root.wait<IFluidHandle<ITaskManager>>("taskmanager").then(async (h)=>h.get());

        if(counter === undefined) {
            throw new Error("counter not available");
        }
        if(taskmanager === undefined) {
            throw new Error("taskmanger not available");
        }

        if(reset) {
            await LoadTestDataStoreModel.waitForCatchup(runtime);
            runDir.set("startTime",Date.now());
            runDir.set("taskTime",0);
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
        public readonly counter: ISharedCounter) {
            this.taskId = `op_sender${Math.floor(config.runId / 2)}`;
        }

    public get startTime(): number {
        return this.dir.get<number>("startTime") ?? 0;
    }
    public get totalTaskTime(): number {
        return (this.dir.get<number>("taskTime") ?? 0) + this.currentTaskTime;
    }
    public get currentTaskTime(): number {
        return this.haveTaskLock() ? Date.now() - this.taskStartTime : 0;
    }

    public haveTaskLock() {
        return this.taskManager.haveTaskLock(this.taskId);
    }

    public abandonTask() {
        if(this.haveTaskLock()) {
            this.taskManager.abandon(this.taskId);
        }
    }

    public async lockTask() {
        if(!this.runtime.connected) {
            await new Promise((res,rej)=>{
                this.runtime.once("connected",res);
                this.runtime.once("dispose", rej);
            });
        }
        await this.taskManager.lockTask(this.taskId);
        this.taskStartTime = Date.now();
        this.taskManager.once("lost",(taskId)=>{
            if(taskId === this.taskId) {
                this.dir.set("taskTime", Date.now() - this.taskStartTime);
                this.taskStartTime = 0;
            }
        });
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

    public async run(config: IRunConfig, reset: boolean = false) {
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
            try{
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
            }catch {}
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
