/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";

/**
 * DataObjectWithCounter increments a SharedCounter as a way of sending ops.
 *
 * The SharedCounter is retrieved via handle
 */
const counterKey = "counter";
export class DataObjectWithCounter extends DataObject {
    private counter?: SharedCounter;
    public isRunning: boolean = false;
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

    public async sendOp() {
        assert(this.counter !== undefined, "Can't send ops when the counter isn't initialized!");
        assert(this.isRunning === true, `The DataObject should be running in order to generate ops!`);
        this.counter.increment(1);
    }

    public stop() {
        this.isRunning = false;
    }
}

export const dataObjectWithCounterFactory = new DataObjectFactory(
    DataObjectWithCounter.type,
    DataObjectWithCounter,
    [SharedCounter.getFactory()],
    {},
);
