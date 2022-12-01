/* eslint-disable jsdoc/check-indentation */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import random from "random-js";
import { v4 as uuid } from "uuid";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert, delay, stringToBuffer } from "@fluidframework/common-utils";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { SharedCounter } from "@fluidframework/counter";
import { SharedMap } from "@fluidframework/map";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { IRunConfig } from "./loadTestDataStore";

/** An object (data store or attachment blob based) that can run / stop activity in the test. */
export interface IGCActivityObject {
    readonly handle: IFluidHandle<ArrayBufferLike | DataObject>;
    run: (config: IRunConfig, id?: string) => Promise<boolean>;
    stop: () => void;
}

/**
 * The maximum number of leaf children that can be running at a given time. This is used to limit the number of
 * ops that can be sent per minute so that ops are not throttled.
*/
const maxRunningLeafChildren = 3;

/**
 * Activities that can be performed in the test.
 */
const GCActivityType = {
    /** Create a child data object and reference it. */
    CreateAndReference: 0,
    /** Unreference a referenced child data object. */
    Unreference: 1,
    /** Revive an unreferenced child data object. */
    Revive: 2,
};
type GCActivityType = typeof GCActivityType[keyof typeof GCActivityType];

/**
 * The details of an activity object that is tracked by a data store.
 */
interface IActivityObjectDetails {
    id: string;
    object: IGCActivityObject;
}

/**
 * The activity object implementation for an attachment blob.
 * On run, the attachment blob is retrieved on a regular interval.
 */
class AttachmentBlobObject implements IGCActivityObject {
    private myId: string | undefined;
    private shouldRun: boolean = false;

    constructor(public handle: IFluidHandle<ArrayBufferLike>) {}

    public async run(config: IRunConfig, id?: string): Promise<boolean> {
        console.log(`~~~~~~~~~~~ Started attachment blob [${id}]`);
        this.myId = id;
        this.shouldRun = true;
        let done = true;
        const delayBetweenBlobGetMs = 60 * 1000 / config.testConfig.opRatePerMin;
        while (this.shouldRun) {
            try {
                await this.handle.get();
            } catch (error) {
                done = false;
                break;
            }
            // Random jitter of +- 50% of delayBetweenOpsMs so that all clients don't do this at the same time.
            await delay(delayBetweenBlobGetMs + delayBetweenBlobGetMs * random.real(0, .5, true)(config.randEng));
        }
        return done;
    }

    public stop() {
        if (this.shouldRun) {
            console.log(`~~~~~~~~~~~ Stopped attachment blob [${this.myId}]`);
            this.shouldRun = false;
        }
    }
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
 * sends ops at a regular interval by incrementing a counter.
 */
export class DataObjectLeaf extends BaseDataObject implements IGCActivityObject {
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
        if (this.shouldRun) {
            console.log(`+++++++++ Stopped leaf child (in stop) [${this.myId}]: ${this.counter.value}`);
            this.shouldRun = false;
        }
    }
}

export const dataObjectFactoryLeaf = new DataObjectFactory(
    DataObjectLeaf.type,
    DataObjectLeaf,
    [SharedCounter.getFactory()],
    {},
);

/**
 * Data object that can create other data objects or attachment blobs and run activity on them. It does not however
 * interact with the data objects created by other clients (i.e., it's not collab). This emulates user scenarios
 * where each user is working on their own part of a document.
 * This data object does the following:
 * - It sends ops at a regular interval. The interval is defined by the config passed to the run method.
 * - After every few ops, it does a random activity. Example of activities it can perform:
 *   - Create a child data object, reference it and run activity on it.
 *   - Ask a child data object to stop running and unreferenced it.
 *   - Upload an attachment blob, reference it and start running activity on it.
 */
export class DataObjectNonCollab extends BaseDataObject implements IGCActivityObject {
    public static get type(): string {
        return "DataObjectNonCollab";
    }

    protected myId: string | undefined;
    private shouldRun: boolean = false;

    /** The number of child data objects created. */
    private childCount = 1;

    /** The number of blobs uploaded. */
    private blobCount = 1;
    /** Unique id that is used to generate unique blob content. */
    private readonly uniqueBlobContentId: string = uuid();

    /**
     * The config with which to run a child data object.
     * Note: This should not be called before "run" is called which initializes it.
     */
    private _childRunConfig: IRunConfig | undefined;
    protected get childRunConfig(): IRunConfig {
        assert(this._childRunConfig !== undefined, "Run config must be available");
        return this._childRunConfig;
    }

    private readonly dataObjectMapKey = "dataObjectMap";
    /**
     * The map that stores the fluid handles to all child data objects.
     * Note: This should not be called before "run" is called which initializes it.
     */
    private _dataObjectMap: SharedMap | undefined;
    protected get dataObjectMap(): SharedMap {
        assert(this._dataObjectMap !== undefined, "Child map cannot be retrieving before initialization");
        return this._dataObjectMap;
    }

    private readonly blobMapKey = "blobMap";
    /**
     * The map that stores the fluid handles to all attachment blobs.
     * Note: This should not be called before "run" is called which initializes it.
     */
    private _blobMap: SharedMap | undefined;
    protected get blobMap(): SharedMap {
        assert(this._blobMap !== undefined, "Blob map cannot be retrieving before initialization");
        return this._blobMap;
    }

    private readonly unreferencedChildDataObjects: IActivityObjectDetails[] = [];
    private readonly referencedChildDataObjects: IActivityObjectDetails[] = [];

    private readonly unreferencedAttachmentBlobs: IActivityObjectDetails[] = [];
    private readonly referencedAttachmentBlobs: IActivityObjectDetails[] = [];

    protected async initializingFirstTime(): Promise<void> {
        await super.initializingFirstTime();
        this.root.set<IFluidHandle>(this.dataObjectMapKey, SharedMap.create(this.runtime).handle);
        this.root.set<IFluidHandle>(this.blobMapKey, SharedMap.create(this.runtime).handle);
    }

    protected async hasInitialized(): Promise<void> {
        await super.hasInitialized();
        const dataObjectMapHandle = this.root.get<IFluidHandle<SharedMap>>(this.dataObjectMapKey);
        assert(dataObjectMapHandle !== undefined, "The child map handle should exist on initialization");
        this._dataObjectMap = await dataObjectMapHandle.get();

        const blobMapHandle = this.root.get<IFluidHandle<SharedMap>>(this.blobMapKey);
        assert(blobMapHandle !== undefined, "The blob map handle should exist on initialization");
        this._blobMap = await blobMapHandle.get();
    }

    /**
     * Runs activity on initial set of objects that are referenced, if any. When a container reloads because
     * of error or session expiry, it can have referenced objects that should now run.
     * @returns A set of promises of each object's run result.
     */
    private async runInitialActivity(): Promise<boolean[]> {
        const runP: Promise<boolean>[] = [];
        // Initialize the referenced data object list from the data object map.
        for (const childDetails of this.dataObjectMap) {
            const childId = childDetails[0];
            const childHandle = childDetails[1] as IFluidHandle<DataObjectLeaf>;
            const childObject = await childHandle.get();
            this.referencedChildDataObjects.push({
                id: childId,
                object: childObject,
            });
            runP.push(childObject.run(this.childRunConfig, childId));
        }

        // Initialize the referenced blob list from the blob map.
        for (const blobDetails of this.blobMap) {
            const blobId = blobDetails[0];
            const blobObject = new AttachmentBlobObject(blobDetails[1] as IFluidHandle<ArrayBufferLike>);
            this.referencedAttachmentBlobs.push({
                id: blobId,
                object: blobObject,
            });
            runP.push(blobObject.run(this.childRunConfig, blobId));
        }

        return Promise.all(runP);
    }

    public async run(config: IRunConfig, id?: string): Promise<boolean> {
        console.log(`########## Started child [${id}]`);
        this.myId = id;
        this.shouldRun = true;
        /**
         * Adjust the totalSendCount and opRatePerMin such that this data store and its child data objects collectively
         * send totalSendCount number of ops at opRatePerMin. There can be maximum of maxRunningLeafChildren children
         * running at the same time. So maxDataStores = maxRunningLeafChildren + 1 (this data store).
         * - Ops per minute sent by this data store and its children is 1/maxDataStores times the opRatePerMin.
         * - totalSendCount of this data stores is 1/maxDataStores times the totalSendCount as its children are also
         *   sending ops at the same. What this boils down to is that totalSendCount is controlling how long the test
         *   runs since the total number of ops sent may be less than totalSendCount.
         */
        const maxDataStores = maxRunningLeafChildren + 1;
        const opRatePerMin = Math.ceil(config.testConfig.opRatePerMin / maxDataStores);
        const totalSendCount = config.testConfig.totalSendCount / maxDataStores;
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
        const delayBetweenOpsMs = 60 * 1000 / opRatePerMin;

        let localSendCount = 0;
        let activityFailed = false;

        // Run activity on initial set of referenced objects, if any.
        this.runInitialActivity().then((results: boolean[]) => {
            for (const result of results) {
                if (result === false) {
                    activityFailed = true;
                    break;
                }
            }
        }).catch((error) => {
            activityFailed = true;
        });

        while (this.shouldRun && this.counter.value < totalSendCount && !this.runtime.disposed && !activityFailed) {
            // After every activityThresholdOpCount ops, perform activities.
            if (localSendCount % activityThresholdOpCount === 0) {
                console.log(
                    `########## child data object [${this.myId}]: ${localSendCount} / ${this.counter.value} / ${totalSendCount}`);

                // We do no await for the activity because we want any child created to run asynchronously.
                this.performDataStoreActivity(config).then((done: boolean) => {
                    if (!done) {
                        activityFailed = true;
                    }
                }).catch((error) => {
                    activityFailed = true;
                });

                this.performBlobActivity(config).then((done: boolean) => {
                    if (!done) {
                        activityFailed = true;
                    }
                }).catch((error) => {
                    activityFailed = true;
                });
            }

            this.counter.increment(1);
            localSendCount++;

            // Random jitter of +- 50% of delayBetweenOpsMs so that all clients don't do this at the same time.
            await delay(delayBetweenOpsMs + delayBetweenOpsMs * random.real(0, .5, true)(config.randEng));
        }

        console.log(`########## Stopped child [${this.myId}]: ${localSendCount} / ${this.counter.value}`);
        this.stop();
        const notDone = this.runtime.disposed || activityFailed;
        return !notDone;
    }

    public stop() {
        this.shouldRun = false;
        this.referencedChildDataObjects.forEach((childDetails: IActivityObjectDetails) => {
            childDetails.object.stop();
        });
        this.referencedAttachmentBlobs.forEach((blobDetails: IActivityObjectDetails) => {
            blobDetails.object.stop();
        });
    }

    /**
     * Performs one of the following activity at random:
     * 1. CreateAndReference - Create a child data object, reference it and ask it to run.
     * 2. Unreference - Unreference the oldest referenced child and asks it to stop running.
     * 3. Revive - Re-reference the oldest unreferenced child and ask it to run.
     */
    private async performDataStoreActivity(config: IRunConfig): Promise<boolean> {
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
                    if (this.referencedChildDataObjects.length > 0) {
                        this.unreferenceChild();
                        activityCompleted = true;
                    }
                    break;
                }
                case GCActivityType.Revive: {
                    const nextUnreferencedChildDetails = this.unreferencedChildDataObjects.shift();
                    if (nextUnreferencedChildDetails !== undefined) {
                        return this.reviveChild(nextUnreferencedChildDetails);
                    }
                    break;
                }
                default:
                    break;
            }
        }
        return activityCompleted;
    }

    /**
     * Returns whether it's possible to run a new child at the moment. For instance, there is a limit on the number
     * of child than can be running in parallel to control the number of ops per minute.
     */
    private canRunNewChild() {
        return this.referencedChildDataObjects.length < maxRunningLeafChildren;
    }

    /**
     * Creates a new child data object, reference it and ask it to run.
     */
    private async createAndReferenceChild(): Promise<boolean> {
        // Give each child a unique id w.r.t. this data store's id.
        const childId = `${this.myId}/ds-${this.childCount.toString()}`;
        console.log(`########## Creating child [${childId}]`);
        this.childCount++;

        const child = await dataObjectFactoryLeaf.createChildInstance(this.context);
        this.dataObjectMap.set(childId, child.handle);
        this.referencedChildDataObjects.push({
            id: childId,
            object: child,
        });
        return child.run(this.childRunConfig, childId);
    }

    /**
     * Retrieves the oldest referenced child, asks it to stop running and unreferences it.
     */
    private unreferenceChild() {
        const childDetails = this.referencedChildDataObjects.shift();
        assert(childDetails !== undefined, "Cannot find child to unreference");
        console.log(`########## Unreferencing child [${childDetails.id}]`);

        const childHandle = this.dataObjectMap.get<IFluidHandle<IGCActivityObject>>(childDetails.id);
        assert(childHandle !== undefined, "Could not get handle for child");

        childDetails.object.stop();

        this.dataObjectMap.delete(childDetails.id);
        this.unreferencedChildDataObjects.push(childDetails);
    }

    /**
     * Retrieves the oldest unreferenced child, references it and asks it to run.
     */
    private async reviveChild(childDetails: IActivityObjectDetails): Promise<boolean> {
        console.log(`########## Reviving child [${childDetails.id}]`);
        this.dataObjectMap.set(childDetails.id, childDetails.object.handle);
        this.referencedChildDataObjects.push(childDetails);
        return childDetails.object.run(this.childRunConfig, childDetails.id);
    }

    /**
     * Performs one of the following activity at random:
     * 1. CreateAndReference - Upload an attachment blob and reference it.
     * 2. Unreference - Unreference the oldest referenced attachment blob.
     * 3. Revive - Re-reference the oldest unreferenced attachment blob.
     */
    private async performBlobActivity(config: IRunConfig): Promise<boolean> {
        let activityCompleted = false;
        while (!activityCompleted) {
            const blobAction = random.integer(0, 2)(config.randEng);
            switch (blobAction) {
                case GCActivityType.CreateAndReference: {
                    // Give each blob a unique id w.r.t. this data store's id.
                    const blobId = `${this.myId}/blob-${this.blobCount.toString()}`;
                    console.log(`########## Creating blob [${blobId}]`);
                    const blobContents = `Content - ${this.uniqueBlobContentId}-${this.blobCount}`;
                    this.blobCount++;
                    const blobHandle = await this.context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
                    this.blobMap.set(blobId, blobHandle);

                    const blobObject = new AttachmentBlobObject(blobHandle);
                    this.referencedAttachmentBlobs.push({
                        id: blobId,
                        object: blobObject,
                    });
                    return blobObject.run(this.childRunConfig, blobId);
                }
                case GCActivityType.Unreference: {
                    if (this.referencedAttachmentBlobs.length > 0) {
                        const blobDetails = this.referencedAttachmentBlobs.shift();
                        assert(blobDetails !== undefined, "Cannot find blob to unreference");
                        console.log(`########## Unreferencing blob [${blobDetails.id}]`);

                        const blobHandle = this.blobMap.get<IFluidHandle<ArrayBufferLike>>(blobDetails.id);
                        assert(blobHandle !== undefined, "Could not get handle for blob");

                        blobDetails.object.stop();
                        this.blobMap.delete(blobDetails.id);
                        this.unreferencedAttachmentBlobs.push(blobDetails);
                        activityCompleted = true;
                    }
                    break;
                }
                case GCActivityType.Revive: {
                    const nextunreferencedAttachmentBlobs = this.unreferencedAttachmentBlobs.shift();
                    if (nextunreferencedAttachmentBlobs !== undefined) {
                        console.log(`########## Reviving blob [${nextunreferencedAttachmentBlobs.id}]`);
                        this.blobMap.set(nextunreferencedAttachmentBlobs.id, nextunreferencedAttachmentBlobs.object.handle);
                        this.referencedAttachmentBlobs.push(nextunreferencedAttachmentBlobs);
                        return nextunreferencedAttachmentBlobs.object.run(this.childRunConfig, nextunreferencedAttachmentBlobs.id);
                    }
                    break;
                }
                default:
                    break;
            }
        }
        return activityCompleted;
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
 * Data object that does every thing DataObjectNotCollab does. In addition, it interacts with the objects created by
 * other clients (i.e., it's collab). This emulates user scenarios where multiple users are working on common parts
 * of a document.
 */
 export class DataObjectCollab extends DataObjectNonCollab implements IGCActivityObject {
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
         * Set up an event handler that listens for changes in the data object map meaning that a child data object
         * was referenced or unreferenced by a client.
         */
        this.dataObjectMap.on("valueChanged", (changed, local) => {
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
            if (this.dataObjectMap.has(changed.key)) {
                const childHandle = this.dataObjectMap.get(changed.key) as IFluidHandle<IGCActivityObject>;
                childHandle.get().then((child: IGCActivityObject) => {
                    console.log(`---------- Running remote child [${changed.key}]`);
                    child.run(this.childRunConfig, `${this.myId}/${changed.key}`).catch((error) => {});
                }).catch((error) => {});
            } else {
                const childHandle = changed.previousValue as IFluidHandle<IGCActivityObject>;
                childHandle.get().then((child: IGCActivityObject) => {
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
export class RootDataObject extends DataObject implements IGCActivityObject {
    public static get type(): string {
        return "RootDataObject";
    }

    private readonly dataObjectNonCollabKey = "nonCollabChild";
    private readonly dataObjectCollabKey = "collabChild";

    private nonCollabChild: IGCActivityObject | undefined;
    private collabChild: IGCActivityObject | undefined;

    protected async initializingFirstTime(): Promise<void> {
        await super.initializingFirstTime();

        const nonCollabChild = await dataObjectFactoryNonCollab.createChildInstance(this.context);
        this.root.set<IFluidHandle>(this.dataObjectNonCollabKey, nonCollabChild.handle);

        const collabChild = await dataObjectFactoryCollab.createChildInstance(this.context);
        this.root.set<IFluidHandle>(this.dataObjectCollabKey, collabChild.handle);
    }

    public async run(config: IRunConfig): Promise<boolean> {
        const nonCollabChildHandle = this.root.get<IFluidHandle<IGCActivityObject>>(this.dataObjectNonCollabKey);
        assert(nonCollabChildHandle !== undefined, "Non collab data store not present");
        this.nonCollabChild = await nonCollabChildHandle.get();

        const collabChildHandle = this.root.get<IFluidHandle<IGCActivityObject>>(this.dataObjectCollabKey);
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
        const approxDelayMs = 1000;
        await delay(approxDelayMs + approxDelayMs * random.real(0, .5, true)(config.randEng));
        const child1RunP = this.nonCollabChild.run(childConfig, `client${config.runId + 1}NonCollab`);

        await delay(approxDelayMs + approxDelayMs * random.real(0, .5, true)(config.randEng));
        const child2RunP = this.collabChild.run(childConfig, `client${config.runId + 1}Collab`);

        return Promise.all([child1RunP, child2RunP]).then(([child1Result, child2Result]) => {
            return child1Result && child2Result;
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

const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
    runtime.IFluidHandleContext.resolveHandle(request);

export const createGCFluidExport = (options: IContainerRuntimeOptions) =>
    new ContainerRuntimeFactoryWithDefaultDataStore(
        rootDataObjectFactory,
        [
            [rootDataObjectFactory.type, Promise.resolve(rootDataObjectFactory)],
        ],
        undefined,
        [innerRequestHandler],
        options,
    );
