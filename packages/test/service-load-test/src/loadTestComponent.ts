/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultComponent,
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";

export interface IRunConfig {
    runId: number;
    opRatePerMin: number;
    progressInterval: number;
    totalSendCount: number;
    numClients: number;
}

export interface ILoadTest {
    run(config: IRunConfig): Promise<void>;
}

const wait = async (time: number) => new Promise((resolve) => setTimeout(resolve, time));

class LoadTestComponent extends PrimedComponent implements ILoadTest {
    public static ComponentName = "StressTestComponent";
    private opCount = 0;
    private sentCount = 0;
    private state: string = "not started";
    protected async componentHasInitialized() {
        this.root.on("op", () => {
            this.opCount++;
        });
    }

    public async pause(time: number) {
        const startTime = Date.now();
        this.state = "paused";
        await wait(time);
        this.state = "running";
        return Date.now() - startTime;
    }

    private printStatus(config: IRunConfig, startTime: number, runningStartTime: number) {
        const now = Date.now();
        const totalMin = (now - startTime) / 60000;
        const runningMin = (now - runningStartTime) / 60000;
        const opRate = Math.floor(this.opCount / totalMin);
        const sendRate = Math.floor(this.sentCount / runningMin);
        console.log(
            `${config.runId.toString().padStart(3)}>` +
            ` seen: ${this.opCount.toString().padStart(8)} (${opRate.toString().padStart(4)}/min),` +
            ` sent: ${this.sentCount.toString().padStart(8)} (${sendRate.toString().padStart(2)}/min),` +
            ` run time: ${runningMin.toFixed(2).toString().padStart(5)} min`,
            ` total time: ${totalMin.toFixed(2).toString().padStart(5)} min`,
        );
    }

    public async run(config: IRunConfig) {
        console.log(`${config.runId.toString().padStart(3)}> waiting`);
        await new Promise((resolve) => {
            let memberCount = this.context.getQuorum().getMembers().size;
            if (memberCount >= config.numClients) { resolve(); }
            this.context.getQuorum().on("addMember", () => {
                memberCount++;
                if (memberCount >= config.numClients) { resolve(); }
            });
        });
        console.log(`${config.runId.toString().padStart(3)}> begin`);
        const startTime = Date.now();
        let runningStartTime = startTime;

        // Assuming we want 120 concurrent writers, so we need two set running together
        // So divide the numClients by two
        const repeatTime = (config.numClients / 2) * 1000;

        runningStartTime += await this.pause((config.runId * 1000) % repeatTime);

        console.log(`${config.runId.toString().padStart(3)}> started`);

        let t: NodeJS.Timeout;
        const printProgress = () => {
            if (this.state !== "paused") {
                this.printStatus(config, startTime, runningStartTime);
            }
            t = setTimeout(printProgress, config.progressInterval);
        };
        t = setTimeout(printProgress, config.progressInterval);

        const opWaitSecond = (60 / config.opRatePerMin) * 1000;
        const clientSendCount = config.totalSendCount / config.numClients;
        while (this.sentCount < clientSendCount) {
            await this.runStep();
            if (this.sentCount % config.opRatePerMin === 0) {
                // Pause for a min
                runningStartTime += await this.pause(repeatTime - 60000);  // assume run length is 1 min
            } else {
                // Wait +- .5s of waitTime
                await wait(opWaitSecond - 500 + Math.random() * 1000);
            }
        }

        this.state = "stopped";
        clearTimeout(t);

        this.printStatus(config, startTime, runningStartTime);
        console.log(`${config.runId.toString().padStart(3)}> finished`);
    }

    public async runStep() {
        this.root.set(Math.floor(Math.random() * 32).toString(), Math.random());
        this.sentCount++;
    }
}

const LoadTestComponentInstantiationFactory = new PrimedComponentFactory(
    LoadTestComponent.ComponentName,
    LoadTestComponent,
    [],
    {},
);

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    LoadTestComponent.ComponentName,
    new Map([[LoadTestComponent.ComponentName, Promise.resolve(LoadTestComponentInstantiationFactory)]]),
);
