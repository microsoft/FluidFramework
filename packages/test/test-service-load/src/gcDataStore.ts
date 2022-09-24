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
 * How much faster than its parent should a data stores at each level send ops.
 */
const opRateMultiplierPerLevel = 1;

/**
 * Activities that data stores perform.
 */
const GCActivityType = {
    /** Create a child data store and reference it. */
    CreateAndReference: 0,
    /** Unreference a referenced child data store. */
    Unreference: 1,
    /** Revive an unreferenced child data store. */
    Revive: 2,
};
type GCActivityType = typeof GCActivityType[keyof typeof GCActivityType];

export interface IGCDataStore {
    readonly handle: IFluidHandle;
    run: (config: IRunConfig, id?: string) => Promise<boolean>;
    stop: () => void;
}

/**
 * The details of a child that is tracked by a data store.
 */
interface IChildDetails {
    id: string;
    child: IGCDataStore;
}

interface IUnreferencedChildDetails extends IChildDetails {
    unreferencedTimestamp: number;
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

    public async run(config: IRunConfig, id?: string): Promise<boolean> {
        console.log(`+++++++++ Started child [${id}]`);
        this.myId = id;
        this.shouldRun = true;
        const delayBetweenOpsMs = 60 * 1000 / config.testConfig.opRatePerMin;
        let localSendCount = 0;
        while (this.shouldRun && !this.runtime.disposed) {
            if (localSendCount % 50 === 0) {
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
    private readonly uniquechildId = `${this.myId}-child`;
    private child: IGCDataStore | undefined;

    private _inactiveTimeoutMs: number | undefined;
    /**
     * Should not be called before "run" is called which initializes inactiveTimeoutMs.
     */
    public get inactiveTimeoutMs(): number {
        assert(this._inactiveTimeoutMs !== undefined, "inactive timeout is required for GC tests");
        return this._inactiveTimeoutMs;
    }

    private readonly unreferencedChildrenDetails: IUnreferencedChildDetails[] = [];
    private readonly referencedChildrenDetails: IChildDetails[] = [];
    private readonly expiredChildrenDetails: IChildDetails[] = [];

    public async run(config: IRunConfig): Promise<boolean> {
        assert(config.testConfig.inactiveTimeoutMs !== undefined, "inactive timeout is required for GC tests");
        this._inactiveTimeoutMs = config.testConfig.inactiveTimeoutMs - 500;

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
                this.performActivity(config).then((done: boolean) => {
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

        this.stop();
        const notDone = this.runtime.disposed || childFailed;
        console.log(
            `########## Stopping [${this.myId}]: ${this.runtime.disposed} / ${childFailed} / ${localSendCount}`);
        return !notDone;
    }

    public stop() {
        this.shouldRun = false;
        this.referencedChildrenDetails.forEach((childDetails: IChildDetails) => {
            childDetails.child.stop();
        });
    }

    /**
     * @deprecated - Keeping this around for now while the new logic runs in CI few times.
     *
     * Perform the following activity:
     * - Ask the current child data store to stop running and unreferenced it.
     * - Create a child data store, reference it and asks it to run.
     */
    public async performActivityOld(config: IRunConfig) {
        this.child?.stop();
        this.child = await dataObjectType1Factory.createInstance(this.context.containerRuntime);
        // This will unreference the previous child and reference the new one.
        this.root.set(this.uniquechildId, this.child.handle);

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

    /**
     * Performs one of the following activity at random:
     * 1. CreateAndReference - Create a child data store, reference it and ask it to run.
     * 2. Unreference - Unreference the oldest referenced child and asks it to stop running.
     * 3. Revive - Re-reference the oldest unreferenced child and ask it to run.
     */
    private async performActivity(config: IRunConfig): Promise<boolean> {
        /**
         * Tracks if the random activity completed. Keeps trying to run an activity until one completes.
         * For Unreference and Revive activities to complete, there has to be referenced and unreferenced
         * children respectively. If there are none, choose another activity to run.
        */
        let activityCompleted = false;
        while (!activityCompleted) {
            activityCompleted = false;
            const action = random.integer(0, 2)(config.randEng);
            switch (action) {
                case GCActivityType.CreateAndReference: {
                    console.log("########## Creating child");
                    return this.createAndReferenceChild(config);
                }
                case GCActivityType.Unreference: {
                    console.log("########## Unreferencing child");
                    if (this.referencedChildrenDetails.length > 0) {
                        this.unreferenceChild();
                        activityCompleted = true;
                    }
                    break;
                }
                case GCActivityType.Revive: {
                    console.log("########## Reviving child");
                    const revivableChildDetails = this.getRevivableChild();
                    if (revivableChildDetails !== undefined) {
                        return this.reviveChild(config, revivableChildDetails);
                    }
                    break;
                }
                default:
                    break;
            }
        }
        return true;
    }

    /**
     * Creates a new child data store, reference it and ask it to run.
     */
    private async createAndReferenceChild(config: IRunConfig): Promise<boolean> {
        // Give each child a unique id w.r.t. this data store's id.
        const childId = `${this.myId}-${this.childCount.toString()}`;
        this.childCount++;

        const child = await dataObjectType1Factory.createInstance(this.context.containerRuntime);
        this.root.set(childId, child.handle);
        this.referencedChildrenDetails.push({
            id: childId,
            child,
        });

        // Set up the child to send ops opRateMultiplierPerLevel times faster than this data store.
        const opRatePerMin = config.testConfig.opRatePerMin * opRateMultiplierPerLevel;
        const childConfig: IRunConfig = {
            ...config,
            testConfig: {
                ...config.testConfig,
                opRatePerMin,
            },
        };
        return child.run(childConfig, childId);
    }

    /**
     * Retrieves the oldest referenced child, asks it to stop running and unreferences it.
     */
    private unreferenceChild() {
        const childDetails = this.referencedChildrenDetails.shift();
        assert(childDetails !== undefined, "Cannot find child to unreference");

        const childHandle = this.root.get<IFluidHandle<IGCDataStore>>(childDetails.id);
        assert(childHandle !== undefined, "Could not get handle for child");

        childDetails.child.stop();

        this.root.delete(childDetails.id);
        this.unreferencedChildrenDetails.push({
            ...childDetails,
            unreferencedTimestamp: Date.now(),
        });
    }

    /**
     * Retrieves the oldes unreferenced child, references it and asks it to run.
     */
    private async reviveChild(config: IRunConfig, childDetails: IChildDetails): Promise<boolean> {
        this.root.set(childDetails.id, childDetails.child.handle);
        this.referencedChildrenDetails.push(childDetails);

        // Set up the child to send ops opRateMultiplierPerLevel times faster than this data store.
        const opRatePerMin = config.testConfig.opRatePerMin * opRateMultiplierPerLevel;
        const childConfig: IRunConfig = {
            ...config,
            testConfig: {
                ...config.testConfig,
                opRatePerMin,
            },
        };
        return childDetails.child.run(childConfig, childDetails.id);
    }

    /**
     * If there is a child that can be revived, returns its details. Otherwise, returns undefined.
     * It also moves any expired child to the expired child list.
     */
    private getRevivableChild(): IUnreferencedChildDetails | undefined {
        let childDetails = this.unreferencedChildrenDetails.shift();
        while (childDetails !== undefined) {
            if (Date.now() - childDetails.unreferencedTimestamp > (this.inactiveTimeoutMs)) {
                this.expiredChildrenDetails.push(childDetails);
            } else {
                break;
            }
            childDetails = this.unreferencedChildrenDetails.shift();
        }
        return childDetails;
    }
}

export const rootDataObjectFactory = new DataObjectFactory(
    RootDataObject.type,
    RootDataObject,
    [SharedCounter.getFactory()],
    {},
);
