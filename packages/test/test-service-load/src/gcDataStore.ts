/* eslint-disable jsdoc/check-indentation */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert, delay } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IRunConfig } from "./loadTestDataStore";

export interface IGCDataStore {
    readonly handle: IFluidHandle;
    run: (config: IRunConfig) => Promise<boolean>;
    stop: () => void;
}

/**
 * Base data object that creates and initializes a SharedCounter. This can be extended by all data objects
 * to send ops by incrementing the counter.
 */
class BaseDataObject extends DataObject {
    public static get type(): string {
        return "DataObjectWithCounter";
    }

    private readonly counterKey = "counter";
    private _counter: SharedCounter | undefined;
    protected get counter(): SharedCounter {
        assert(this._counter !== undefined, "Counter cannot be retrieving before initialization");
        return this._counter;
    }

    protected async initializingFirstTime(): Promise<void> {
        this.root.set<IFluidHandle>(this.counterKey, SharedCounter.create(this.runtime).handle);
    }

    protected async hasInitialized(): Promise<void> {
        const handle = this.root.get<IFluidHandle<SharedCounter>>(this.counterKey);
        assert(handle !== undefined, "The counter handle should exist on initialization");
        this._counter = await handle.get();
    }
}

/**
 * Data object type 1 that does the following when asked to run:
 * - It sends ops at a regular interval. The interval is defined by the config passed to the run method.
 */
export class DataObjectType1 extends BaseDataObject implements IGCDataStore {
    public static get type(): string {
        return "DataObjectType1";
    }

    private shouldRun: boolean = false;

    public async run(config: IRunConfig) {
        console.log("+++++++++ Starting child");
        this.shouldRun = true;
        const delayBetweenOpsMs = 60 * 1000 / config.testConfig.opRatePerMin;
        while (this.shouldRun && !this.runtime.disposed) {
            this.counter.increment(1);
            await delay(delayBetweenOpsMs);
        }
        return !this.runtime.disposed;
    }

    public stop() {
        console.log("+++++++++ Stopping child");
        this.shouldRun = false;
    }
}

export const dataObjectType1Factory = new DataObjectFactory(
    DataObjectType1.type,
    DataObjectType1,
    [SharedCounter.getFactory()],
    {},
);

/**
 * Root data object for the stress tests that does the following when asked to run:
 * - It sends ops at a regular interval. The interval is defined by the config passed to the run method.
 * - After every few ops, it does an activity. Example activities:
 *     - Create a child data store, reference it and asks it to run.
 *     - Ask a child data store to stop running and unreferenced it.
 */
export class RootDataObject extends BaseDataObject implements IGCDataStore {
    public static get type(): string {
        return "RootDataObject";
    }

    private shouldRun: boolean = false;

    private readonly uniqueChildKey = `${uuid()}-child`;
    private child: IGCDataStore | undefined;

    public async run(config: IRunConfig) {
        this.shouldRun = true;
        const delayBetweenOpsMs = 60 * 1000 / config.testConfig.opRatePerMin;
        const clientSendCount = config.testConfig.totalSendCount / config.testConfig.numClients;
        let localSendCount = 0;

        while (this.shouldRun && localSendCount < clientSendCount && !this.runtime.disposed) {
            if (localSendCount % 3 === 0) {
                console.log(
                    `########## GC DATA STORE [${this.runtime.clientId}]: ${localSendCount} / ${this.counter.value}`);
            }

            // After every 3 ops, perform an activity.
            if (localSendCount % 3 === 0) {
                await this.preformActivity(config);
            }

            this.counter.increment(1);
            localSendCount++;
            await delay(delayBetweenOpsMs);
        }
        return !this.runtime.disposed;
    }

    public stop() {
        this.shouldRun = false;
    }

    /**
     * Perform the following activity:
     * - Ask the current child data store to stop running and unreferenced it.
     * - Create a child data store, reference it and asks it to run.
     */
    private async preformActivity(config: IRunConfig) {
        this.child?.stop();
        this.child = await dataObjectType1Factory.createInstance(this.context.containerRuntime);
        // This will unreference the previous child and reference the new one.
        this.root.set(this.uniqueChildKey, this.child.handle);

        // Set up the child to send ops 10 times faster than this data store.
        const childConfig: IRunConfig = { ...config };
        childConfig.testConfig.opRatePerMin = config.testConfig.opRatePerMin * 10;

        this.child.run(childConfig).then((done: boolean) => {
            throw new Error("Child was disposed while running");
        }).catch((error) => {
            throw new Error(`Error when running child: ${error}`);
        });
    }
}

export const rootDataObjectFactory = new DataObjectFactory(
    RootDataObject.type,
    RootDataObject,
    [SharedCounter.getFactory()],
    {},
);
