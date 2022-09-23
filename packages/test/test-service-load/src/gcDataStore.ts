/* eslint-disable jsdoc/check-indentation */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import random from "random-js";
import { v4 as uuid } from "uuid";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert, delay } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IRunConfig } from "./loadTestDataStore";

/**
 * How much faster than its parent should a data stores at each level sends ops.
 */
const opRateMultiplierPerLevel = 5;

export interface IGCDataStore {
    readonly handle: IFluidHandle;
    run: (config: IRunConfig, id?: string) => Promise<boolean>;
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
    private myId: string | undefined;

    public async run(config: IRunConfig, id?: string) {
        console.log(`+++++++++ Started child [${id}]`);
        this.myId = id;
        this.shouldRun = true;
        const delayBetweenOpsMs = 60 * 1000 / config.testConfig.opRatePerMin;
        let localSendCount = 0;
        while (this.shouldRun && !this.runtime.disposed) {
            if (localSendCount % 10 === 0) {
                console.log(
                    `+++++++++ Child Data Store [${this.myId}]: ${localSendCount} / ${this.counter.value}`);
            }

            this.counter.increment(1);
            localSendCount++;
            // Random jitter of +- 50% of delayBetweenOpsMs so that all clients don't do this at the same time.
            await delay(delayBetweenOpsMs + delayBetweenOpsMs * random.real(0, .5, true)(config.randEng));
        }
        return !this.runtime.disposed;
    }

    public stop() {
        console.log(`+++++++++ Stopped child [${this.myId}]`);
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

    // Create a unique Id for ourselves.
    private readonly myId = uuid();

    // The number of child data stores created.
    private childCount = 1;

    // The key against which handle to child data store is stored.
    private readonly uniqueChildKey = `${this.myId}-child`;
    private child: IGCDataStore | undefined;

    public async run(config: IRunConfig) {
        this.shouldRun = true;
        const delayBetweenOpsMs = 60 * 1000 / config.testConfig.opRatePerMin;
        const totalSendCount = config.testConfig.totalSendCount;
        let localSendCount = 0;
        let childFailed = false;

        while (this.shouldRun && this.counter.value < totalSendCount && !this.runtime.disposed && !childFailed) {
            if (localSendCount % 10 === 0) {
                console.log(
                    `########## GC DATA STORE [${this.myId}]: ${localSendCount} / ${this.counter.value}`);
            }

            // After every few ops, perform an activity.
            if (localSendCount % 10 === 0) {
                // We do no await for the activity because we want any child created to run asynchronously.
                this.preformActivity(config).then((done: boolean) => {
                    if (!done) {
                        childFailed = true;
                    }
                }).catch((error) => {
                    childFailed = true;
                });
            }

            this.counter.increment(1);
            localSendCount++;

            // Random jitter of +- 50% of delayBetweenOpsMs so that all clients don't do this at the same time.
            await delay(delayBetweenOpsMs + delayBetweenOpsMs * random.real(0, .5, true)(config.randEng));
        }

        this.child?.stop();
        const notDone = this.runtime.disposed || childFailed;
        return !notDone;
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

        // Set up the child to send ops opRateMultiplierPerLevel times faster than this data store.
        const opRatePerMin = config.testConfig.opRatePerMin * opRateMultiplierPerLevel;
        const childConfig: IRunConfig = {
            ...config,
            testConfig: {
                ...config.testConfig,
                opRatePerMin,
            },
        };

        // Give each child a unique id w.r.t. this data store's id.
        const uniquechildId = `${this.myId}-${this.childCount.toString()}`;
        this.childCount++;

        return this.child.run(childConfig, uniquechildId);
    }
}

export const rootDataObjectFactory = new DataObjectFactory(
    RootDataObject.type,
    RootDataObject,
    [SharedCounter.getFactory()],
    {},
);
