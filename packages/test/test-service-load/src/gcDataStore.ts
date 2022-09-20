/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert, delay } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IRunConfig } from "./loadTestDataStore";

/**
 * DataObjectWithCounter increments a SharedCounter as a way of sending ops.
 *
 * The SharedCounter is retrieved via handle
 */
const counterKey = "counter";
export class DataObjectWithCounter extends DataObject {
    private _counter?: SharedCounter;
    protected isRunning: boolean = false;
    public static get type(): string {
        return "DataObjectWithCounter";
    }

    protected get counter(): SharedCounter {
        assert(this._counter !== undefined, "Need counter to be defined before retreiving!");
        return this._counter;
    }

    protected async initializingFirstTime(props?: any): Promise<void> {
        this.root.set<IFluidHandle>(counterKey, SharedCounter.create(this.runtime).handle);
    }

    protected async hasInitialized(): Promise<void> {
        const handle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
        assert(handle !== undefined, `The counter handle should exist on initialization!`);
        this._counter = await handle.get();
    }

    public stop() {
        this.isRunning = false;
    }

    // public start() {
    //     this.run().catch((error) => { console.log(error); });
    // }

    public async run(config: IRunConfig) {
        this.isRunning = true;
        const delayPerOpMs = 60 * 1000 / config.testConfig.opRatePerMin;
        // div by 2 for parent/child
        const clientSendCount = config.testConfig.totalSendCount / config.testConfig.numClients / 2;
        let localCount = 0;
        while (this.isRunning && !this.disposed) {
            this.counter.increment(1);
            localCount++;
            if (localCount % 3 === 1) {
                console.log(
                    `########## GC DATA STORE [${this.runtime.clientId}]: ${localCount} / ${this.counter.value}`);
            }
            if (localCount >= clientSendCount) {
                break;
            }
            await delay(delayPerOpMs);
        }
        return true;
    }
}

export const dataObjectWithCounterFactory = new DataObjectFactory(
    DataObjectWithCounter.type,
    DataObjectWithCounter,
    [SharedCounter.getFactory()],
    {},
);

export class DataObjectParent extends DataObjectWithCounter {
    private child: DataObjectWithCounter | undefined;
    public static get type(): string {
        return "DataObjectParent";
    }
    protected async hasInitialized(): Promise<void> {
        await super.hasInitialized();

        this.child = await dataObjectWithCounterFactory.createInstance(this.context.containerRuntime);
    }

    public async run(config: IRunConfig) {
        const childP = this.child?.run(config);
        const parentP = super.run(config);
        const allP = await Promise.all([childP, parentP]);
        return allP.every((done) => done);
    }
}

export const dataObjectParentFactory = new DataObjectFactory(
    DataObjectParent.type,
    DataObjectParent,
    [SharedCounter.getFactory()],
    {},
);
