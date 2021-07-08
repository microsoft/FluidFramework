/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory, } from "@fluidframework/aqueduct";
const wait = async (timeMs) => new Promise((resolve) => setTimeout(resolve, timeMs));
class LoadTestDataStore extends DataObject {
    constructor() {
        super(...arguments);
        this.opCount = 0;
        this.sentCount = 0;
        this.state = "not started";
    }
    async hasInitialized() {
        this.root.on("op", () => {
            this.opCount++;
        });
    }
    async pause(timeMs) {
        const startTimeMs = Date.now();
        this.state = "paused";
        await wait(timeMs);
        this.state = "running";
        return Date.now() - startTimeMs;
    }
    printStatus(config, startTimeMs, runningStartTimeMs) {
        const now = Date.now();
        const totalMin = (now - startTimeMs) / 60000;
        const runningMin = (now - runningStartTimeMs) / 60000;
        const opRate = Math.floor(this.opCount / totalMin);
        const sendRate = Math.floor(this.sentCount / runningMin);
        console.log(`${config.runId.toString().padStart(3)}>` +
            ` seen: ${this.opCount.toString().padStart(8)} (${opRate.toString().padStart(4)}/min),` +
            ` sent: ${this.sentCount.toString().padStart(8)} (${sendRate.toString().padStart(2)}/min),` +
            ` run time: ${runningMin.toFixed(2).toString().padStart(5)} min`, ` total time: ${totalMin.toFixed(2).toString().padStart(5)} min`);
    }
    async run(config) {
        // Wait for all runners to join
        console.log(`${config.runId.toString().padStart(3)}> waiting`);
        await new Promise((resolve) => {
            let memberCount = this.context.getQuorum().getMembers().size;
            if (memberCount >= config.testConfig.numClients) {
                resolve();
            }
            this.context.getQuorum().on("addMember", () => {
                memberCount++;
                if (memberCount >= config.testConfig.numClients) {
                    resolve();
                }
            });
        });
        console.log(`${config.runId.toString().padStart(3)}> begin`);
        // At every moment, we want half the client to be concurrent writers, and start and stop
        // in a rotation fashion for every cycle.
        // To set that up we start each client in a staggered way, each will independently go thru write
        // and listen cycles
        const cycleMs = config.testConfig.readWriteCycleMs;
        // the time gap to start each client over two cycles  (or one full read/write cycle)
        // to get half the client active at a time
        const clientStartGapMs = cycleMs * 2 / config.testConfig.numClients;
        const startTimeMs = Date.now();
        let runningStartTimeMs = startTimeMs + await this.pause(config.runId * clientStartGapMs);
        console.log(`${config.runId.toString().padStart(3)}> started`);
        let t;
        const printProgress = () => {
            if (this.state !== "paused") {
                this.printStatus(config, startTimeMs, runningStartTimeMs);
            }
            t = setTimeout(printProgress, config.testConfig.progressIntervalMs);
        };
        t = setTimeout(printProgress, config.testConfig.progressIntervalMs);
        const clientSendCount = config.testConfig.totalSendCount / config.testConfig.numClients;
        const opsPerCycle = config.testConfig.opRatePerMin * cycleMs / 60000;
        const opsGapMs = cycleMs / opsPerCycle;
        while (this.sentCount < clientSendCount) {
            await this.runStep();
            // Send cycle worth of Ops
            if (this.sentCount % opsPerCycle === 0) {
                // Pause writing for cycle before resuming
                runningStartTimeMs += await this.pause(cycleMs);
            }
            else {
                // Random jitter of +- 50% of opWaitMs
                await wait(opsGapMs + opsGapMs * (Math.random() - 0.5));
            }
        }
        this.state = "stopped";
        clearTimeout(t);
        this.printStatus(config, startTimeMs, runningStartTimeMs);
        console.log(`${config.runId.toString().padStart(3)}> finished`);
    }
    async runStep() {
        this.root.set(Math.floor(Math.random() * 32).toString(), Math.random());
        this.sentCount++;
    }
}
LoadTestDataStore.DataStoreName = "StressTestDataStore";
const LoadTestDataStoreInstantiationFactory = new DataObjectFactory(LoadTestDataStore.DataStoreName, LoadTestDataStore, [], {});
export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(LoadTestDataStoreInstantiationFactory, new Map([[LoadTestDataStore.DataStoreName, Promise.resolve(LoadTestDataStoreInstantiationFactory)]]));
//# sourceMappingURL=loadTestDataStore.js.map