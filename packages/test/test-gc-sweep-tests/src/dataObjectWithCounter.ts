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
    protected counter?: SharedCounter;
    public isRunning: boolean = false;
    protected readonly delayPerOpMs = 100;
    public static get type(): string {
        return "DataObjectWithCounter";
    }

    protected async initializingFirstTime(props?: any): Promise<void> {
        this.root.set<IFluidHandle>(counterKey, SharedCounter.create(this.runtime).handle);
    }

    protected async hasInitialized(): Promise<void> {
        const handle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
        assert(handle !== undefined, `The counter handle should exist on initialization!`);
        this.counter = await handle.get();
    }

    protected sendOp() {
        assert(this.counter !== undefined, "Can't send ops when the counter isn't initialized!");
        assert(this.isRunning === true, `The DataObject should be running in order to generate ops!`);
        this.counter.increment(1);
    }

    public stop() {
        this.isRunning = false;
    }

    public start() {
        this.isRunning = true;
        this.sendOps().catch((error) => { console.log(error); });
    }

    protected async sendOps() {
        assert(this.isRunning === true, "Should be running to send ops");
        while (this.isRunning && !this.disposed) {
            this.sendOp();
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
