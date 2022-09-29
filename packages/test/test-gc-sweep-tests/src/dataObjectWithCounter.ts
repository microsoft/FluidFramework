/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert, delay } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";

/**
 * DataObjectWithCounter increments a SharedCounter as a way of sending ops.
 *
 * The SharedCounter is retrieved via handle
 */
const counterKey = "counter";
export class DataObjectWithCounter extends DataObject {
    private _counter?: SharedCounter;
    protected isRunning: boolean = false;
    protected readonly delayPerOpMs = 100;
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

    public start() {
        this.isRunning = true;
        this.run().catch((error) => { console.log(error); });
    }

    protected async run() {
        assert(this.isRunning === true, "Should be running to send ops");
        while (this.isRunning && !this.disposed) {
            this.counter.increment(1);
            await delay(this.delayPerOpMs);
        }
    }
}

export const dataObjectWithCounterFactory = new DataObjectFactory(
    DataObjectWithCounter.type,
    DataObjectWithCounter,
    [SharedCounter.getFactory()],
    {},
);
