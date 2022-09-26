/* eslint-disable jsdoc/check-indentation */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import random from "random-js";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert, delay } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { SharedMap } from "@fluidframework/map";
import { IRunConfig } from "./loadTestDataStore";

/**
 * How much faster than its parent should a data stores at each level send ops.
 * Keeping this 1 for now to prevent throttling of ops.
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

/**
 * The details of an unreferenced child. It includes the timestamp when the child was unreferenced.
 */
interface IUnreferencedChildDetails extends IChildDetails {
    unreferencedTimestamp: number;
}

/**
 * Base data object that creates and initializes a SharedCounter. This can be extended by all data objects
 * to send ops by incrementing the counter.
 */
abstract class BaseDataObject extends DataObject {
    public static type: string;

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

    private myId: string | undefined;
    private shouldRun: boolean = false;

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

    protected myId: string | undefined;
    private shouldRun: boolean = false;

    // The number of child data stores created.
    private childCount = 1;

    /**
     * Should not be called before "run" is called which initializes inactiveTimeoutMs.
     */
    private _inactiveTimeoutMs: number | undefined;
    public get inactiveTimeoutMs(): number {
        assert(this._inactiveTimeoutMs !== undefined, "inactive timeout is required for GC tests");
        return this._inactiveTimeoutMs;
    }

    /**
     * Should not be called before "run" is called which initializes runConfig.
     */
    private _runConfig: IRunConfig | undefined;
    protected get runConfig(): IRunConfig {
        assert(this._runConfig !== undefined, "Run config must be available");
        return this._runConfig;
    }

    private readonly childMapKey = "childMap";
    private _childMap: SharedMap | undefined;
    protected get childMap(): SharedMap {
        assert(this._childMap !== undefined, "Child map cannot be retrieving before initialization");
        return this._childMap;
    }

    private readonly unreferencedChildrenDetails: IUnreferencedChildDetails[] = [];
    private readonly referencedChildrenDetails: IChildDetails[] = [];
    private readonly expiredChildrenDetails: IChildDetails[] = [];

    protected async initializingFirstTime(): Promise<void> {
        await super.initializingFirstTime();
        this.root.set<IFluidHandle>(this.childMapKey, SharedMap.create(this.runtime).handle);
    }

    protected async hasInitialized(): Promise<void> {
        await super.hasInitialized();
        const handle = this.root.get<IFluidHandle<SharedMap>>(this.childMapKey);
        assert(handle !== undefined, "The child map handle should exist on initialization");
        this._childMap = await handle.get();
    }

    public async run(config: IRunConfig): Promise<boolean> {
        assert(config.testConfig.inactiveTimeoutMs !== undefined, "inactive timeout is required for GC tests");
        // Set the local inactive timeout 500 less than the actual to keep buffer when expiring data stores.
        this._inactiveTimeoutMs = config.testConfig.inactiveTimeoutMs - 500;
        // Set up the child to send ops opRateMultiplierPerLevel times faster than this data store.
        const opRatePerMin = config.testConfig.opRatePerMin * opRateMultiplierPerLevel;
        this._runConfig = {
            ...config,
            testConfig: {
                ...config.testConfig,
                opRatePerMin,
            },
        };
        this.myId = `client${config.runId + 1}`;
        this.shouldRun = true;

        const opRatePerClient = config.testConfig.opRatePerMin / config.testConfig.numClients;
        const delayBetweenOpsMs = 60 * 1000 / opRatePerClient;
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
                    return this.createAndReferenceChild(config);
                }
                case GCActivityType.Unreference: {
                    if (this.referencedChildrenDetails.length > 0) {
                        this.unreferenceChild();
                        activityCompleted = true;
                    }
                    break;
                }
                case GCActivityType.Revive: {
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
        const childId = `${this.myId}/${this.childCount.toString()}`;
        console.log(`########## Creating child [${childId}]`);
        this.childCount++;

        const child = await dataObjectType1Factory.createInstance(this.context.containerRuntime);
        this.childMap.set(childId, child.handle);
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
        console.log(`########## Unreferencing child [${childDetails.id}]`);

        const childHandle = this.childMap.get<IFluidHandle<IGCDataStore>>(childDetails.id);
        assert(childHandle !== undefined, "Could not get handle for child");

        childDetails.child.stop();

        this.childMap.delete(childDetails.id);
        this.unreferencedChildrenDetails.push({
            ...childDetails,
            unreferencedTimestamp: Date.now(),
        });
    }

    /**
     * Retrieves the oldes unreferenced child, references it and asks it to run.
     */
    private async reviveChild(config: IRunConfig, childDetails: IChildDetails): Promise<boolean> {
        console.log(`########## Reviving child [${childDetails.id}]`);
        this.childMap.set(childDetails.id, childDetails.child.handle);
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
    [SharedCounter.getFactory(), SharedMap.getFactory()],
    {},
);

/**
 * Root data object for the stress tests that does the following when asked to run:
 * - It sends ops at a regular interval. The interval is defined by the config passed to the run method.
 * - After every few ops, it does an activity. Example activities:
 *     - Create a child data store, reference it and asks it to run. When other clients learn about this, they may also
 *       start running their local copy of this child data store.
 *     - Ask a child data store to stop running and unreferenced it. When other clients learn about this, they may stop
 *       running this child data store.
 */
 export class RootDataObject2 extends RootDataObject implements IGCDataStore {
    public static get type(): string {
        return "RootDataObject2";
    }

    public async run(config: IRunConfig): Promise<boolean> {
        const partnerId1 = `client${config.runId + 2}`;
        const partnerId2 = `client${config.runId + 3}`;
        this.childMap.on("valueChanged", (changed, local) => {
            if (local) {
                return;
            }

            /**
             * Only collaborate with two other partner clients. If we collaborate with all clients, there would be too
             * many ops and we might get throttled.
             */
            if (!changed.key.startsWith(partnerId1) && !changed.key.startsWith(partnerId2)) {
                return;
            }

            if (this.childMap.has(changed.key)) {
                console.log(`---------- Received remote child add [${this.myId}] / [${changed.key}]`);
                const childHandle = this.childMap.get(changed.key) as IFluidHandle<IGCDataStore>;
                childHandle.get().then((child: IGCDataStore) => {
                    console.log(`---------- Running remote child [${changed.key}]`);
                    child.run(this.runConfig, `${this.myId}/${changed.key}`).catch((error) => {});
                }).catch((error) => {});
            } else {
                console.log(`---------- Received remote child delete [${this.myId}] /[${changed.key}]`);
                const childHandle = changed.previousValue as IFluidHandle<IGCDataStore>;
                childHandle.get().then((child: IGCDataStore) => {
                    console.log(`---------- Stopping remote child [${changed.key}]`);
                    child.stop();
                }).catch((error) => {});
            }
        });

        return super.run(config);
    }
}

export const rootDataObjectFactory2 = new DataObjectFactory(
    RootDataObject2.type,
    RootDataObject2,
    [SharedCounter.getFactory(), SharedMap.getFactory()],
    {},
);
