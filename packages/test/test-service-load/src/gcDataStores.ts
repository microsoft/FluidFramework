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

export interface IGCDataStore {
    readonly handle: IFluidHandle;
    run: (config: IRunConfig, id?: string) => Promise<boolean>;
    stop: () => void;
}

/**
 * The maximum number of leaf children that can be running at a given time. This is used to limit the number of
 * ops that can be sent per minute so that ops are not throttled.
*/
const maxRunningLeafChildren = 3;

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
 * Data object that should be the leaf in the data object hierarchy. It does not create any data stores but simply
 * sends ops at a regular interval by incementing a counter.
 */
export class DataObjectLeaf extends BaseDataObject implements IGCDataStore {
    public static get type(): string {
        return "DataObjectLeaf";
    }

    private myId: string | undefined;
    private shouldRun: boolean = false;

    public async run(config: IRunConfig, id?: string): Promise<boolean> {
        console.log(`+++++++++ Started leaf child [${id}]`);
        this.myId = id;
        this.shouldRun = true;
        const delayBetweenOpsMs = 60 * 1000 / config.testConfig.opRatePerMin;
        let localSendCount = 0;
        while (this.shouldRun && !this.runtime.disposed) {
            if (localSendCount % 10 === 0) {
                console.log(
                    `+++++++++ Leaf child [${this.myId}]: ${localSendCount} / ${this.counter.value}`);
            }

            this.counter.increment(1);
            localSendCount++;
            // Random jitter of +- 50% of delayBetweenOpsMs so that all clients don't do this at the same time.
            await delay(delayBetweenOpsMs + delayBetweenOpsMs * random.real(0, .5, true)(config.randEng));
        }
        console.log(`+++++++++ Stopped leaf child [${this.myId}]: ${localSendCount} / ${this.counter.value}`);
        return !this.runtime.disposed;
    }

    public stop() {
        console.log(`+++++++++ Stopped leaf child (in stop) [${this.myId}]: ${this.counter.value}`);
        this.shouldRun = false;
    }
}

export const dataObjectFactoryLeaf = new DataObjectFactory(
    DataObjectLeaf.type,
    DataObjectLeaf,
    [SharedCounter.getFactory()],
    {},
);

/**
 * Data object that can create other data objects and run then. It does not however interact with the data objects
 * created by other clients (i.e., it's not collab). This emulates user scenarios where each user is working on
 * their own part of a document.
 * This data object does the following:
 * - It sends ops at a regular interval. The interval is defined by the config passed to the run method.
 * - After every few ops, it does a random activity. Example of activities it can perform:
 *   - Create a child data store, reference it and asks it to run.
 *   - Ask a child data store to stop running and unreferenced it.
 */
export class DataObjectNonCollab extends BaseDataObject implements IGCDataStore {
    public static get type(): string {
        return "DataObjectNonCollab";
    }

    protected myId: string | undefined;
    private shouldRun: boolean = false;

    /** The number of child data stores created. */
    private childCount = 1;

    /**
     * The inactive timeout after which a child data object should not be revived.
     * Note: This should not be called before "run" is called which initializes it.
     */
    private _inactiveTimeoutMs: number | undefined;
    public get inactiveTimeoutMs(): number {
        assert(this._inactiveTimeoutMs !== undefined, "inactive timeout is required for GC tests");
        return this._inactiveTimeoutMs;
    }

    /**
     * The config with which to run a child data object.
     * Note: This should not be called before "run" is called which initializes it.
     */
    private _childRunConfig: IRunConfig | undefined;
    protected get childRunConfig(): IRunConfig {
        assert(this._childRunConfig !== undefined, "Run config must be available");
        return this._childRunConfig;
    }

    private readonly childMapKey = "childMap";
    /**
     * The map that stores the fluid handles to all child data objects.
     * Note: This should not be called before "run" is called which initializes it.
     */
    private _childMap: SharedMap | undefined;
    protected get childMap(): SharedMap {
        assert(this._childMap !== undefined, "Child map cannot be retrieving before initialization");
        return this._childMap;
    }

    private readonly unreferencedChildrenDetails: IUnreferencedChildDetails[] = [];
    private readonly referencedChildrenDetails: IChildDetails[] = [];
    private readonly inactiveChildrenDetails: IChildDetails[] = [];

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

    public async run(config: IRunConfig, id?: string): Promise<boolean> {
        console.log(`########## Started child [${id}]`);
        assert(config.testConfig.inactiveTimeoutMs !== undefined, "inactive timeout is required for GC tests");

        this.myId = id;
        this.shouldRun = true;
        // Set the local inactive timeout 500 less than the actual to keep buffer when marking data stores as inactive.
        this._inactiveTimeoutMs = config.testConfig.inactiveTimeoutMs - 500;

        /**
         * Adjust the totalSendCount and opRatePerMin. There can be maximum of maxRunningLeafChildren children running
         * at the same time.
         * - This data store and each child sends 1/4th of the number of ops per min.
         * - This data store sends 1/4th the number of total ops since its sending at 1/4th the op rate.
         */
        const opRatePerMin = Math.ceil(config.testConfig.opRatePerMin / (maxRunningLeafChildren + 1));
        const totalSendCount = config.testConfig.totalSendCount / 4;
        this._childRunConfig = {
            ...config,
            testConfig: {
                ...config.testConfig,
                opRatePerMin,
                totalSendCount,
            },
        };

        // Perform an activity every 1/6th minute = every 10 seconds.
        const activityThresholdOpCount = Math.ceil((opRatePerMin / 6));
        let localSendCount = 0;
        let childFailed = false;
        const delayBetweenOpsMs = 60 * 1000 / opRatePerMin;
        while (this.shouldRun && this.counter.value < totalSendCount && !this.runtime.disposed && !childFailed) {
            // After every activityThresholdOpCount ops, perform an activity.
            if (localSendCount % activityThresholdOpCount === 0) {
                console.log(
                    `########## Child data store [${this.myId}]: ${localSendCount} / ${this.counter.value}`);

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

        console.log(`########## Stopped child [${this.myId}]: ${localSendCount} / ${this.counter.value}`);
        this.stop();
        const notDone = this.runtime.disposed || childFailed;
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

            // Add a new reference or revive only if it's possible to run a child at the moment.
            const action = this.canRunNewChild() ? random.integer(0, 2)(config.randEng) : GCActivityType.Unreference;
            switch (action) {
                case GCActivityType.CreateAndReference: {
                    return this.createAndReferenceChild();
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
                        return this.reviveChild(revivableChildDetails);
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
     * Returns whether it's possible to run a new child at the moment. For instance, there is a limit on the number
     * of child than can be running in parallel to control the number of ops per minute.
     */
    private canRunNewChild() {
        if (this.referencedChildrenDetails.length < maxRunningLeafChildren) {
            return true;
        }
        return false;
    }

    /**
     * Creates a new child data store, reference it and ask it to run.
     */
    private async createAndReferenceChild(): Promise<boolean> {
        // Give each child a unique id w.r.t. this data store's id.
        const childId = `${this.myId}/${this.childCount.toString()}`;
        console.log(`########## Creating child [${childId}]`);
        this.childCount++;

        const child = await dataObjectFactoryLeaf.createChildInstance(this.context);
        this.childMap.set(childId, child.handle);
        this.referencedChildrenDetails.push({
            id: childId,
            child,
        });
        return child.run(this.childRunConfig, childId);
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
     * Retrieves the oldest unreferenced child, references it and asks it to run.
     */
    private async reviveChild(childDetails: IChildDetails): Promise<boolean> {
        console.log(`########## Reviving child [${childDetails.id}]`);
        this.childMap.set(childDetails.id, childDetails.child.handle);
        this.referencedChildrenDetails.push(childDetails);
        return childDetails.child.run(this.childRunConfig, childDetails.id);
    }

    /**
     * If there is a child that can be revived, returns its details. Otherwise, returns undefined.
     * It also moves any expired child to the expired child list.
     */
    private getRevivableChild(): IUnreferencedChildDetails | undefined {
        let childDetails = this.unreferencedChildrenDetails.shift();
        while (childDetails !== undefined) {
            if (Date.now() - childDetails.unreferencedTimestamp > (this.inactiveTimeoutMs)) {
                this.inactiveChildrenDetails.push(childDetails);
            } else {
                break;
            }
            childDetails = this.unreferencedChildrenDetails.shift();
        }
        return childDetails;
    }
}

export const dataObjectFactoryNonCollab = new DataObjectFactory(
    DataObjectNonCollab.type,
    DataObjectNonCollab,
    [SharedCounter.getFactory(), SharedMap.getFactory()],
    {},
    [
        [DataObjectLeaf.type, Promise.resolve(dataObjectFactoryLeaf)],
    ],
);

/**
 * Data object that does every thing DataObjectNotCollab does. In addition, it interacts with the data objects
 * created by other clients (i.e., it's collab). This emulates user scenarios where multiple users are working on
 * a common part of a document.
 */
 export class DataObjectCollab extends DataObjectNonCollab implements IGCDataStore {
    public static get type(): string {
        return "DataObjectCollab";
    }

    public async run(config: IRunConfig, id?: string): Promise<boolean> {
        this.myId = id;

        /**
         * Just some weird math to get the ids of two other clients to collaborate with.
         */
        const halfClients = Math.floor(config.testConfig.numClients / 2);
        const myRunId = config.runId + 1;
        const partnerRunId1 = ((myRunId + halfClients) % config.testConfig.numClients) + 1;
        const partnerRunId2 = ((myRunId + halfClients + 1) % config.testConfig.numClients) + 1;
        const partnerId1 = `client${partnerRunId1}`;
        const partnerId2 = `client${partnerRunId2}`;
        console.log(`---------- Collab data store partners [${this.myId}]: ${partnerId1} / ${partnerId2}`);

        /**
         * Set up an event handler that listens for changes in the child map meaning that a child data store
         * was referenced or unreferenced by a client.
         */
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

            /**
             * If a new child was referenced, run our corresponding local child.
             * If a child was unreferenced, stop running our corresponding local child.
             * TODO: Handle scenario where these children fail. Also, when we are asked to stop, we should stop these
             * children as well.
             */
            if (this.childMap.has(changed.key)) {
                const childHandle = this.childMap.get(changed.key) as IFluidHandle<IGCDataStore>;
                childHandle.get().then((child: IGCDataStore) => {
                    console.log(`---------- Running remote child [${changed.key}]`);
                    child.run(this.childRunConfig, `${this.myId}/${changed.key}`).catch((error) => {});
                }).catch((error) => {});
            } else {
                const childHandle = changed.previousValue as IFluidHandle<IGCDataStore>;
                childHandle.get().then((child: IGCDataStore) => {
                    console.log(`---------- Stopping remote child [${changed.key}]`);
                    child.stop();
                }).catch((error) => {});
            }
        });

        return super.run(config, id);
    }
}

export const dataObjectFactoryCollab = new DataObjectFactory(
    DataObjectCollab.type,
    DataObjectCollab,
    [SharedCounter.getFactory(), SharedMap.getFactory()],
    {},
    [
        [DataObjectLeaf.type, Promise.resolve(dataObjectFactoryLeaf)],
    ],
);

/**
 * Root data object that creates a collab and a non-collab child and runs them.
 */
export class RootDataObject extends DataObject implements IGCDataStore {
    public static get type(): string {
        return "RootDataObject";
    }

    private readonly dataObjectNonCollabKey = "nonCollabChild";
    private readonly dataObjectCollabKey = "collabChild";

    private nonCollabChild: IGCDataStore | undefined;
    private collabChild: IGCDataStore | undefined;

    protected async initializingFirstTime(): Promise<void> {
        await super.initializingFirstTime();

        const nonCollabChild = await dataObjectFactoryNonCollab.createChildInstance(this.context);
        this.root.set<IFluidHandle>(this.dataObjectNonCollabKey, nonCollabChild.handle);

        const collabChild = await dataObjectFactoryCollab.createChildInstance(this.context);
        this.root.set<IFluidHandle>(this.dataObjectCollabKey, collabChild.handle);
    }

    public async run(config: IRunConfig): Promise<boolean> {
        const nonCollabChildHandle = this.root.get<IFluidHandle<IGCDataStore>>(this.dataObjectNonCollabKey);
        assert(nonCollabChildHandle !== undefined, "Non collab data store not present");
        this.nonCollabChild = await nonCollabChildHandle.get();

        const collabChildHandle = this.root.get<IFluidHandle<IGCDataStore>>(this.dataObjectCollabKey);
        assert(collabChildHandle !== undefined, "Collab data store not present");
        this.collabChild = await collabChildHandle.get();

        /**
         * Adjust the op rate and total send count for each child.
         * - Each child sends half the number of ops per min.
         * - Each child sends half the total number of ops.
         */
        const opRatePerMinPerClient = config.testConfig.opRatePerMin / config.testConfig.numClients;
        const opRatePerMinPerChild = Math.ceil(opRatePerMinPerClient / 2);
        const totalSendCountPerChild = Math.ceil(config.testConfig.totalSendCount / 2);
        const childConfig: IRunConfig = {
            ...config,
            testConfig: {
                ...config.testConfig,
                opRatePerMin: opRatePerMinPerChild,
                totalSendCount: totalSendCountPerChild,
            },
        };

        // Add a  random jitter of +- 50% of randomDelayMs to stagger the start of child in each client.
        const randomDelayMs = 1000;
        await delay(randomDelayMs + randomDelayMs * random.real(0, .5, true)(config.randEng));
        const child1RunP = this.nonCollabChild.run(childConfig, `client${config.runId + 1}NonCollab`);

        await delay(randomDelayMs + randomDelayMs * random.real(0, .5, true)(config.randEng));
        const child2RunP = this.collabChild.run(childConfig, `client${config.runId + 1}Collab`);

        return Promise.all([child1RunP, child2RunP]).then((result) => {
            return result[0] && result[1];
        });
    }

    public stop() {
        this.nonCollabChild?.stop();
        this.collabChild?.stop();
    }
}

export const rootDataObjectFactory = new DataObjectFactory(
    RootDataObject.type,
    RootDataObject,
    [SharedCounter.getFactory()],
    {},
    [
        [DataObjectNonCollab.type, Promise.resolve(dataObjectFactoryNonCollab)],
        [DataObjectCollab.type, Promise.resolve(dataObjectFactoryCollab)],
    ],
);
