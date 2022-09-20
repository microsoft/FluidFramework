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
        while (this.isRunning && !this.disposed) {
            this.counter.increment(1);
            if (this.counter.value % 3 === 1) {
                console.log(`########## GC DATA STORE [${this.runtime.clientId}]: ${this.counter.value}`);
            }
            if (this.counter.value >= config.testConfig.totalSendCount) {
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
