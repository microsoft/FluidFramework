/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable jsdoc/check-indentation */

import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { ITelemetryGenericEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, delay, stringToBuffer } from "@fluidframework/common-utils";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { SharedCounter } from "@fluidframework/counter";
import { IValueChanged, SharedMap } from "@fluidframework/map";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { IRunConfig } from "./loadTestDataStore";

/**
 * The maximum number of leaf data objects that can be running at a given time per client. This is used to limit the
 * number of ops that can be sent per minute so that ops are not throttled.
 */
const maxRunningLeafDataObjects = 3;

/**
 * The maximum number of attachment blob objects that can be running at a give time per client. This is used to limit
 * the number of network calls for fetching blobs so that network calls are not throttled.
 */
const maxRunningAttachmentBlobs = 3;

/**
 * The result of running an activity on an object.
 * If activity succeeds, done is true.
 * If activity fails, done is false and the failing node's id and an error is returned.
 */
type ActivityRunResult =
	| {
			done: true;
	  }
	| {
			done: false;
			nodeId: string;
			error: any;
	  };

/** An object (data objects or attachment blob based) that can run / stop activity in the test. */
export interface IGCActivityObject {
	readonly handle: IFluidHandle<ArrayBufferLike | DataObject>;
	run: (config: IRunConfig, nodeId: string) => Promise<ActivityRunResult>;
	stop: () => void;
}

/**
 * The details of an activity object that is tracked by a data object.
 */
interface IActivityObjectDetails {
	id: string;
	object: IGCActivityObject;
}

function logEvent(logger: ITelemetryLogger, props: ITelemetryGenericEvent & { id: string }) {
	logger.sendTelemetryEvent(props);
	console.log(`########## ${props.eventName} - ${props.id}`);
}

function getBlobIdFromHandle(blobHandle: IFluidHandle<ArrayBufferLike>) {
	const pathParts = blobHandle.absolutePath.split("/");
	return pathParts[2];
}

/**
 * Reference activities that can be performed in the test.
 */
const ReferenceActivityType = {
	/** Don't do any referencing or unreferencing. */
	None: 0,
	/**
	 * Another don't do anything activity. This increases the chances of doing nothing which in turn increases
	 * the changes of incremental summary for a data store. This scenario has known to cause GC bugs.
	 */
	AnotherNone: 1,
	/** Unreference a referenced child object. */
	Unreference: 2,
	/** Create a child object and reference it. */
	CreateAndReference: 3,
	/** Revive an unreferenced child object. */
	Revive: 4,
	/** The count of enum values. This is used as the max value for generating an activity at random. */
	Count: 5,
};
type ReferenceActivityType = typeof ReferenceActivityType[keyof typeof ReferenceActivityType];

/**
 * Activities that can be performed by the attachment blob object.
 */
const BlobActivityType = {
	/** Don't do anything. */
	None: 0,
	/** Get the blob via its handle. */
	GetBlob: 1,
	/** The count of enum values. This is used as the max value for generating an activity at random. */
	Count: 2,
};
type BlobActivityType = typeof BlobActivityType[keyof typeof BlobActivityType];

/**
 * Activities that can be performed by the leaf data object.
 */
const LeafActivityType = {
	/** Don't do anything. */
	None: 0,
	/** Update one of the DDSes in the data object. */
	UpdateOneDDS: 1,
	/** Update all the DDSes in the data object. */
	UpdateAllDDS: 2,
	/** The count of enum values. This is used as the max value for generating an activity at random. */
	Count: 3,
};
type LeafActivityType = typeof LeafActivityType[keyof typeof LeafActivityType];

/**
 * The activity object implementation for an attachment blob.
 * On run, the attachment blob is retrieved on a regular interval.
 */
class AttachmentBlobObject implements IGCActivityObject {
	private running: boolean = false;

	constructor(public handle: IFluidHandle<ArrayBufferLike>) {}

	public async run(config: IRunConfig, nodeId: string): Promise<ActivityRunResult> {
		if (this.running) {
			return { done: true };
		}
		this.running = true;

		const delayBetweenBlobGetMs = (60 * 1000) / config.testConfig.opRatePerMin;
		let activityFailed = false;
		let error: any;
		while (this.running) {
			try {
				await this.runActivity(config);
			} catch (e) {
				activityFailed = true;
				error = e;
				break;
			}
			// Random jitter of +- 50% of delayBetweenOpsMs so that all clients don't do this at the same time.
			await delay(delayBetweenBlobGetMs * config.random.real(1, 1.5));
		}
		return { done: !activityFailed, error, nodeId };
	}

	public stop() {
		if (this.running) {
			this.running = false;
		}
	}

	/**
	 * Runs one of the following activity at random:
	 * 1. GetBlob - Retrieves the blob associated with the IFluidHandle.
	 * 2. None - Do nothing. This is to have summaries where no blobs are retrieved.
	 */
	private async runActivity(config: IRunConfig) {
		const activityType = config.random.integer(0, BlobActivityType.Count - 1);
		switch (activityType) {
			case BlobActivityType.GetBlob: {
				await this.handle.get();
				break;
			}
			case BlobActivityType.None:
			default:
				break;
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
 * Data object that should be the leaf in the data object hierarchy. It does not create any data objects but simply
 * sends ops at a regular interval by incrementing a counter.
 */
export class LeafDataObject extends BaseDataObject implements IGCActivityObject {
	public static get type(): string {
		return "LeafDataObject";
	}

	private running: boolean = false;

	private readonly counter2Key = "counter2";
	private _counter2: SharedCounter | undefined;
	protected get counter2(): SharedCounter {
		assert(
			this._counter2 !== undefined,
			"Counter 2 cannot be retrieving before initialization",
		);
		return this._counter2;
	}

	protected async initializingFirstTime(): Promise<void> {
		await super.initializingFirstTime();
		this.root.set<IFluidHandle>(this.counter2Key, SharedCounter.create(this.runtime).handle);
	}

	protected async hasInitialized(): Promise<void> {
		await super.hasInitialized();
		const handle = this.root.get<IFluidHandle<SharedCounter>>(this.counter2Key);
		assert(handle !== undefined, "The counter 2 handle should exist on initialization");
		this._counter2 = await handle.get();
	}

	public async run(config: IRunConfig, nodeId: string): Promise<ActivityRunResult> {
		if (this.running) {
			return { done: true };
		}
		this.running = true;

		const delayBetweenOpsMs = (60 * 1000) / config.testConfig.opRatePerMin;
		let activityFailed = false;
		let error: any;
		while (this.running && !this.runtime.disposed) {
			try {
				this.runActivity(config);
			} catch (e) {
				error = e;
				activityFailed = true;
				break;
			}
			// Random jitter of +- 50% of delayBetweenOpsMs so that all clients don't do this at the same time.
			await delay(delayBetweenOpsMs * config.random.real(1, 1.5));
		}
		const notDone = activityFailed || this.runtime.disposed;
		return { done: !notDone, error, nodeId };
	}

	public stop() {
		if (this.running) {
			this.running = false;
		}
	}

	/**
	 * Runs one of the following activity at random:
	 * 1. UpdateOneDDS - Updates one of the DDSes by sending ops for it. When this happens, chances are that the other
	 * DDS will do incremental summary in the next summary which is an important scenario to test.
	 * 2. UpdateAllDDS - Updates all the DDSes by sending ops for them.
	 * 2. None - Do nothing. This is to have summaries where this data store or its DDS does not change.
	 */
	private runActivity(config: IRunConfig) {
		const activityType = config.random.integer(0, LeafActivityType.Count - 1);
		switch (activityType) {
			case LeafActivityType.UpdateOneDDS: {
				// Randomly choose one of the counters to increment.
				const ddsIndex = config.random.integer(0, 1);
				if (ddsIndex === 0) {
					this.counter.increment(1);
				} else {
					this.counter2.increment(1);
				}
				break;
			}
			case LeafActivityType.UpdateAllDDS: {
				// Increment both the DDSes.
				this.counter.increment(1);
				this.counter2.increment(1);
				break;
			}
			case LeafActivityType.None:
			default:
				break;
		}
	}
}

export const leafDataObjectFactory = new DataObjectFactory(
	LeafDataObject.type,
	LeafDataObject,
	[SharedCounter.getFactory()],
	{},
);

/**
 * Data object that can create other data objects or attachment blobs and run activity on them. It does not however
 * interact with the data objects created by other clients (i.e., it has a single collaborator). This emulates user
 * scenarios where each user is working on their own part of a document.
 * This data object does the following:
 * - It sends ops at a regular interval. The interval is defined by the config passed to the run method.
 * - After every few ops, it does a random activity. Example of activities it can perform:
 *   - Create a child data object, reference it and run activity on it.
 *   - Ask a child data object to stop running and unreferenced it.
 *   - Upload an attachment blob, reference it and start running activity on it.
 */
export class SingleCollabDataObject extends BaseDataObject implements IGCActivityObject {
	public static get type(): string {
		return "SingleCollabDataObject";
	}

	protected get nodeId(): string {
		assert(this._nodeId !== undefined, "id accessed before run");
		return this._nodeId;
	}
	protected _nodeId: string | undefined;
	protected running: boolean = false;
	private activityFailed: boolean = false;
	protected activityFailedError: any;

	/** Prefix used for content for blobs uploaded. This is unique per data store per client. */
	private get blobContentPrefix(): string {
		assert(this._blobContentPrefix !== undefined, "blobContentPrefix accessed before run");
		return this._blobContentPrefix;
	}
	private _blobContentPrefix: string | undefined;

	/**
	 * The number of blobs uploaded in a session. This is used along with blobContentPrefix to generate unique blob
	 * content per session. If a client reloads, this will be reset and the blobs uploaded would have duplicate content
	 * from previous session resulting in blob de-duplication.
	 */
	private blobCount = 1;

	/**
	 * The config with which to run data objects and blobs.
	 * Note: This should not be called before "run" is called which initializes it.
	 */
	private _childRunConfig: IRunConfig | undefined;
	protected get childRunConfig(): IRunConfig {
		assert(this._childRunConfig !== undefined, "Run config must be available");
		return this._childRunConfig;
	}

	private _logger: ITelemetryLogger | undefined;
	private get logger(): ITelemetryLogger {
		assert(this._logger !== undefined, "Logger must be available");
		return this._logger;
	}

	private readonly dataObjectMapKey = "dataObjectMap";
	private readonly blobMapKey = "blobMap";

	/**
	 * The map that stores the Fluid handles to all child data objects.
	 * Note: This should not be called before "run" is called which initializes it.
	 */
	private _dataObjectMap: SharedMap | undefined;
	protected get dataObjectMap(): SharedMap {
		assert(
			this._dataObjectMap !== undefined,
			"Data object map cannot be retrieving before initialization",
		);
		return this._dataObjectMap;
	}

	/**
	 * The map that stores the Fluid handles to all attachment blobs.
	 * Note: This should not be called before "run" is called which initializes it.
	 */
	private _blobMap: SharedMap | undefined;
	protected get blobMap(): SharedMap {
		assert(this._blobMap !== undefined, "Blob map cannot be retrieving before initialization");
		return this._blobMap;
	}

	private readonly unreferencedDataObjects: IActivityObjectDetails[] = [];
	private readonly referencedDataObjects: IActivityObjectDetails[] = [];

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
		assert(
			dataObjectMapHandle !== undefined,
			"The data object map handle should exist on initialization",
		);
		this._dataObjectMap = await dataObjectMapHandle.get();

		const blobMapHandle = this.root.get<IFluidHandle<SharedMap>>(this.blobMapKey);
		assert(blobMapHandle !== undefined, "The blob map handle should exist on initialization");
		this._blobMap = await blobMapHandle.get();
	}

	/**
	 * Activity runner that will report any error during the activity run.
	 */
	protected activityRunnerReporterSync(
		activityFn: () => Promise<ActivityRunResult>,
		failureEventName: string,
	) {
		activityFn()
			.then((result) => {
				if (!result.done) {
					this.activityFailed = true;
					if (result.error !== undefined) {
						this.activityFailedError = result.error;
						this.logger.sendErrorEvent(
							{
								eventName: failureEventName,
								id: this.nodeId,
								failedId: result.nodeId,
							},
							result.error,
						);
					}
				}
			})
			.catch((error) => {
				this.activityFailed = true;
				this.activityFailedError = error;
				this.logger.sendErrorEvent(
					{
						eventName: failureEventName,
						id: this.nodeId,
						failedId: this.nodeId,
					},
					error,
				);
			});
	}

	/**
	 * Set up an event listener that would run / stop activity based on the activities of the previous run of this
	 * client. For example, a client could have referenced / unreferenced data objects, then closed and re-loaded
	 * before those ops were summarizer. So, it would receive those ops after the load and should start / stop
	 * activity accordingly.
	 */
	private setupEventHandlers() {
		const runActivity = async (
			changed: IValueChanged,
			local: boolean,
			isBlob: boolean,
		): Promise<ActivityRunResult> => {
			const changedKey = changed.key;
			if (local || !changedKey.startsWith(this.nodeId)) {
				return { done: true };
			}

			let activityObjectMap: SharedMap;
			let activityObjectDetailsList: IActivityObjectDetails[];
			if (isBlob) {
				activityObjectMap = this.blobMap;
				activityObjectDetailsList = this.referencedAttachmentBlobs;
			} else {
				activityObjectMap = this.dataObjectMap;
				activityObjectDetailsList = this.referencedDataObjects;
			}

			// If the activity map has the changed key, a new object was added.
			if (activityObjectMap.has(changedKey)) {
				const handle = activityObjectMap.get(changedKey);
				assert(handle !== undefined, `Could not find handle for ${changedKey}`);

				// For attachment blobs, the handle is to the blob contents. So, create an attachment blob object.
				// For data stores, the handle is to the data store itself.
				const activityObject = isBlob
					? new AttachmentBlobObject(handle as IFluidHandle<ArrayBufferLike>)
					: await (handle as IFluidHandle<IGCActivityObject>).get();

				// Push the object to the list of activity objects.
				activityObjectDetailsList.push({ id: changedKey, object: activityObject });
				return activityObject.run(this.childRunConfig, `${this.nodeId}/${changedKey}`);
			} else {
				// Find the activity object, remove it from the list and stop running it.
				const index = activityObjectDetailsList.findIndex(
					(objectDetails) => objectDetails.id === changedKey,
				);
				if (index > -1) {
					const activityObjectDetails = activityObjectDetailsList.splice(index, 1);
					const activityObject = activityObjectDetails[0].object;
					activityObject.stop();
				}
				return { done: true };
			}
		};

		this.dataObjectMap.on("valueChanged", (changed, local) => {
			this.activityRunnerReporterSync(
				async () => runActivity(changed, local, false /* isBlob */),
				"TrailingOpDSActivityFailed",
			);
		});

		this.blobMap.on("valueChanged", (changed, local) => {
			this.activityRunnerReporterSync(
				async () => runActivity(changed, local, true /* isBlob */),
				"TrailingOpBlobActivityFailed",
			);
		});
	}

	/**
	 * Initialize the data stores and attachment blobs created by this client. When a container reloads because
	 * of error or session expiry, it can have referenced objects that should now run.
	 */
	private async initialize(): Promise<void> {
		// Initialize the referenced data object list from the data object map.
		for (const dataObjectDetails of this.dataObjectMap) {
			const dataObjectId = dataObjectDetails[0];
			// Only initialize data objects created by this node.
			if (!dataObjectId.startsWith(this.nodeId)) {
				continue;
			}

			const dataObjectHandle = dataObjectDetails[1] as IFluidHandle<LeafDataObject>;
			const dataObject = await dataObjectHandle.get();
			this.referencedDataObjects.push({
				id: dataObjectId,
				object: dataObject,
			});
		}

		// Initialize the referenced blob list from the blob map.
		for (const blobDetails of this.blobMap) {
			const blobId = blobDetails[0];
			// Only initialize blobs created by this node.
			if (!blobId.startsWith(this.nodeId)) {
				continue;
			}

			const blobObject = new AttachmentBlobObject(
				blobDetails[1] as IFluidHandle<ArrayBufferLike>,
			);
			this.referencedAttachmentBlobs.push({
				id: blobId,
				object: blobObject,
			});
		}
	}

	/**
	 * Runs activity on initial set of objects that are referenced, if any. When a container reloads because
	 * of error or session expiry, it can have referenced objects that should now run.
	 * @returns A set of promises of each object's run result.
	 */
	private runInitialActivity(): void {
		// Run the data objects and blobs that are in the referenced list.
		for (const dataObjectDetails of this.referencedDataObjects) {
			this.activityRunnerReporterSync(
				async () => dataObjectDetails.object.run(this.childRunConfig, dataObjectDetails.id),
				"InitialDSActivityFailed",
			);
		}
		for (const blobDetails of this.referencedAttachmentBlobs) {
			this.activityRunnerReporterSync(
				async () => blobDetails.object.run(this.childRunConfig, blobDetails.id),
				"InitialBlobActivityFailed",
			);
		}
	}

	public async run(config: IRunConfig, nodeId: string): Promise<ActivityRunResult> {
		if (this.running) {
			return { done: true };
		}

		this._nodeId = nodeId;
		this._logger = config.logger;
		this.running = true;
		this._blobContentPrefix = `${this.id}-client${config.runId}`;
		/**
		 * Adjust the totalSendCount and opRatePerMin such that this data object and its child data objects collectively
		 * send totalSendCount number of ops at opRatePerMin. There can be maximum of maxRunningLeafDataObjects
		 * running at the same time. So maxDataObjects = maxRunningLeafDataObjects + 1 (this data object).
		 * - Ops per minute sent by this data object and its children is 1/maxDataObjects times the opRatePerMin.
		 * - totalSendCount of this data objects is 1/maxDataObjects times the totalSendCount as its children are also
		 *   sending ops at the same. What this boils down to is that totalSendCount is controlling how long the test
		 *   runs since the total number of ops sent may be less than totalSendCount.
		 */
		const maxDataObjects = maxRunningLeafDataObjects + 1;
		const opRatePerMin = Math.ceil(config.testConfig.opRatePerMin / maxDataObjects);
		const totalSendCount = config.testConfig.totalSendCount / maxDataObjects;
		this._childRunConfig = {
			...config,
			testConfig: {
				...config.testConfig,
				opRatePerMin,
				totalSendCount,
			},
		};
		// Perform an activity every 1/6th minute = every 10 seconds.
		const activityThresholdOpCount = Math.ceil(opRatePerMin / 6);
		const delayBetweenOpsMs = (60 * 1000) / opRatePerMin;

		let localSendCount = 0;

		// Set up the listener that would run / stop activity from previous run of this client.
		this.setupEventHandlers();

		// Initialize referenced objects, if any and run activity on them.
		await this.initialize();

		this.runInitialActivity();

		while (
			this.running &&
			this.counter.value < totalSendCount &&
			!this.runtime.disposed &&
			!this.activityFailed
		) {
			// After every activityThresholdOpCount ops, run activities.
			if (localSendCount % activityThresholdOpCount === 0) {
				this.runActivity(config);
			}

			this.counter.increment(1);
			localSendCount++;

			// Random jitter of +- 50% of delayBetweenOpsMs so that all clients don't do this at the same time.
			await delay(delayBetweenOpsMs * config.random.real(1, 1.5));
		}
		this.stop();
		const notDone = this.runtime.disposed || this.activityFailed;
		return { done: !notDone, error: this.activityFailedError, nodeId };
	}

	public stop() {
		this.running = false;
		this.referencedDataObjects.forEach((dataObjectDetails: IActivityObjectDetails) => {
			dataObjectDetails.object.stop();
		});
		this.referencedAttachmentBlobs.forEach((blobDetails: IActivityObjectDetails) => {
			blobDetails.object.stop();
		});
	}

	private runActivity(config: IRunConfig): void {
		// If it's possible to run a new data object and a new blob, all activities can be performed upto Revive.
		// If not, only activities upto Unreference can be performed.
		const maxActivityIndex =
			this.referencedDataObjects.length < maxRunningLeafDataObjects &&
			this.referencedAttachmentBlobs.length < maxRunningAttachmentBlobs
				? ReferenceActivityType.Count - 1
				: ReferenceActivityType.Unreference;
		const activityType = config.random.integer(0, maxActivityIndex);

		this.activityRunnerReporterSync(
			async () => this.runDataObjectActivity(activityType),
			"DSActivityFailed",
		);
		this.activityRunnerReporterSync(
			async () => this.runBlobActivity(activityType),
			"BlobActivityFailed",
		);
	}

	/**
	 * Runs one of the following activity at random:
	 * 1. CreateAndReference - Create a data object, reference it and ask it to run.
	 * 2. Unreference - Unreference the oldest referenced data object and asks it to stop running.
	 * 3. Revive - Re-reference the oldest unreferenced data object and ask it to run.
	 * 4. None - Do nothing. This is to have summaries where no references changed leading to incremental GC.
	 * 5. AnotherNone - Same as None. This is added to increase the changes of doing nothing.
	 */
	private async runDataObjectActivity(
		activityType: ReferenceActivityType,
	): Promise<ActivityRunResult> {
		switch (activityType) {
			case ReferenceActivityType.CreateAndReference: {
				const dataObject = await leafDataObjectFactory.createChildInstance(this.context);
				const dataObjectId = `${this.nodeId}/ds-${dataObject.id}`;
				this.dataObjectMap.set(dataObjectId, dataObject.handle);
				this.referencedDataObjects.push({
					id: dataObjectId,
					object: dataObject,
				});
				logEvent(this.logger, {
					eventName: "DS+",
					id: dataObjectId,
				});
				return dataObject.run(this.childRunConfig, dataObjectId);
			}
			case ReferenceActivityType.Unreference: {
				if (this.referencedDataObjects.length > 0) {
					const dataObjectDetails = this.referencedDataObjects.shift();
					assert(
						dataObjectDetails !== undefined,
						"Cannot find data object to unreference",
					);

					const dataObjectHandle = this.dataObjectMap.get<
						IFluidHandle<IGCActivityObject>
					>(dataObjectDetails.id);
					assert(dataObjectHandle !== undefined, "Could not get handle for data object");

					dataObjectDetails.object.stop();
					this.dataObjectMap.delete(dataObjectDetails.id);
					this.unreferencedDataObjects.push(dataObjectDetails);
					logEvent(this.logger, {
						eventName: "DS-",
						id: dataObjectDetails.id,
					});
				}
				break;
			}
			case ReferenceActivityType.Revive: {
				const dataObjectDetails = this.unreferencedDataObjects.shift();
				if (dataObjectDetails !== undefined) {
					this.dataObjectMap.set(dataObjectDetails.id, dataObjectDetails.object.handle);
					this.referencedDataObjects.push(dataObjectDetails);
					logEvent(this.logger, {
						eventName: "DS^",
						id: dataObjectDetails.id,
					});
					return dataObjectDetails.object.run(this.childRunConfig, dataObjectDetails.id);
				}
				break;
			}
			case ReferenceActivityType.None:
			case ReferenceActivityType.AnotherNone:
			default:
				break;
		}
		return { done: true };
	}

	/**
	 * Runs one of the following activity at random:
	 * 1. CreateAndReference - Upload an attachment blob and reference it.
	 * 2. Unreference - Unreference the oldest referenced attachment blob.
	 * 3. Revive - Re-reference the oldest unreferenced attachment blob.
	 * 4. None - Do nothing. This is to have summaries where no references changed leading to incremental GC.
	 */
	private async runBlobActivity(activityType: ReferenceActivityType): Promise<ActivityRunResult> {
		switch (activityType) {
			case ReferenceActivityType.CreateAndReference: {
				const blobContents = `Content: ${this.blobContentPrefix}-${this.blobCount++}`;
				const blobHandle = await this.context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				const blobId = `${this.nodeId}/blob-${getBlobIdFromHandle(blobHandle)}`;
				this.blobMap.set(blobId, blobHandle);

				logEvent(this.logger, {
					eventName: "Blob+",
					id: blobId,
				});

				const blobObject = new AttachmentBlobObject(blobHandle);
				this.referencedAttachmentBlobs.push({
					id: blobId,
					object: blobObject,
				});
				return blobObject.run(this.childRunConfig, blobId);
			}
			case ReferenceActivityType.Unreference: {
				if (this.referencedAttachmentBlobs.length > 0) {
					const blobDetails = this.referencedAttachmentBlobs.shift();
					assert(blobDetails !== undefined, "Cannot find blob to unreference");
					logEvent(this.logger, {
						eventName: "Blob-",
						id: blobDetails.id,
					});

					const blobHandle = this.blobMap.get<IFluidHandle<ArrayBufferLike>>(
						blobDetails.id,
					);
					assert(blobHandle !== undefined, "Could not get handle for blob");

					blobDetails.object.stop();
					this.blobMap.delete(blobDetails.id);
					this.unreferencedAttachmentBlobs.push(blobDetails);
				}
				break;
			}
			case ReferenceActivityType.Revive: {
				const nextUnreferencedAttachmentBlob = this.unreferencedAttachmentBlobs.shift();
				if (nextUnreferencedAttachmentBlob !== undefined) {
					logEvent(this.logger, {
						eventName: "Blob^",
						id: nextUnreferencedAttachmentBlob.id,
					});
					this.blobMap.set(
						nextUnreferencedAttachmentBlob.id,
						nextUnreferencedAttachmentBlob.object.handle,
					);
					this.referencedAttachmentBlobs.push(nextUnreferencedAttachmentBlob);
					return nextUnreferencedAttachmentBlob.object.run(
						this.childRunConfig,
						nextUnreferencedAttachmentBlob.id,
					);
				}
				break;
			}
			case ReferenceActivityType.None:
			case ReferenceActivityType.AnotherNone:
			default:
				break;
		}
		return { done: true };
	}
}

export const singleCollabDataObjectFactory = new DataObjectFactory(
	SingleCollabDataObject.type,
	SingleCollabDataObject,
	[SharedCounter.getFactory(), SharedMap.getFactory()],
	{},
	[[LeafDataObject.type, Promise.resolve(leafDataObjectFactory)]],
);

/**
 * Data object that does every thing SingleCollabDataObject does. In addition, it interacts with the objects created by
 * other clients (i.e., it has multiple collaborators). This emulates user scenarios where multiple users are working on
 * the same part of a document.
 */
export class MultiCollabDataObject extends SingleCollabDataObject implements IGCActivityObject {
	public static get type(): string {
		return "MultiCollabDataObject";
	}

	// A map of partner activity objects that are running in this client.
	private readonly partnerActivityObjectsRunning: Map<string, IGCActivityObject> = new Map();

	public async run(config: IRunConfig, nodeId: string): Promise<ActivityRunResult> {
		if (this.running) {
			return { done: true };
		}

		this._nodeId = nodeId;

		// Just some weird math to get the ids of two other clients to collaborate with.
		const halfClients = Math.floor(config.testConfig.numClients / 2);
		const myRunId = config.runId + 1;
		const partnerRunId1 = ((myRunId + halfClients) % config.testConfig.numClients) + 1;
		const partnerRunId2 = ((myRunId + halfClients + 1) % config.testConfig.numClients) + 1;
		const partnerId1 = `client${partnerRunId1}`;
		const partnerId2 = `client${partnerRunId2}`;

		/**
		 * Set up an event listener that will run / stop activity based on the activities of the partner.
		 * If a partner referenced a data store or attachment blob, run activity on the corresponding local object.
		 * If a partner unreferenced a data store or attachment blob, stop activity on the corresponding local object.
		 */
		const runPartnerActivity = async (
			changed: IValueChanged,
			local: boolean,
			activityObjectMap: SharedMap,
			partnerIds: string[],
			isBlob: boolean,
		): Promise<ActivityRunResult> => {
			if (local) {
				return { done: true };
			}

			const changedKey = changed.key;

			// Collaborate with the partners clients specified in partnerIds.
			if (!partnerIds.some((partnerId) => changedKey.startsWith(partnerId))) {
				return { done: true };
			}

			// If a new object was referenced, run our corresponding local data object.
			// If an object was unreferenced, stop running our corresponding local data object.
			if (activityObjectMap.has(changedKey)) {
				// If we this activity object is already running, skip it.
				if (this.partnerActivityObjectsRunning.has(changedKey)) {
					return { done: true };
				}

				const handle = activityObjectMap.get(changedKey);
				assert(handle !== undefined, `Could not find handle for ${changedKey}`);
				// For attachment blobs, the handle is to the blob contents. So, create an attachment blob object.
				// For data stores, the handle is to the data store itself.
				const activityObject = isBlob
					? new AttachmentBlobObject(handle as IFluidHandle<ArrayBufferLike>)
					: await (handle as IFluidHandle<IGCActivityObject>).get();

				// Add the object to the partner activity object map and run it.
				this.partnerActivityObjectsRunning.set(changedKey, activityObject);
				return activityObject.run(this.childRunConfig, `${this.nodeId}/${changedKey}`);
			} else {
				const activityObject = this.partnerActivityObjectsRunning.get(changedKey);
				// Stop running the activity object and delete it from the partner activity object map.
				if (activityObject !== undefined) {
					activityObject.stop();
					this.partnerActivityObjectsRunning.delete(changedKey);
				}
				return { done: true };
			}
		};

		// For data stores, collaborate with two partner clients. This will keep the number of ops to a reasonable
		// number so as to not get throttled.
		this.dataObjectMap.on("valueChanged", (changed, local) => {
			this.activityRunnerReporterSync(
				async () =>
					runPartnerActivity(
						changed,
						local,
						this.dataObjectMap,
						[partnerId1, partnerId2],
						false /* isBlob */,
					),
				"PartnerDSActivityFailed",
			);
		});

		// For attachment blobs, collaborate with one partner client. Blob requests are more sensitive to being
		// throttled. Collaborating with one client will keep the number of requests less while giving coverage.
		this.blobMap.on("valueChanged", (changed, local) => {
			this.activityRunnerReporterSync(
				async () =>
					runPartnerActivity(
						changed,
						local,
						this.blobMap,
						[partnerId1],
						true /* isBlob */,
					),
				"PartnerBlobActivityFailed",
			);
		});

		return super.run(config, nodeId);
	}

	public stop() {
		this.partnerActivityObjectsRunning.forEach((activityObject) => {
			activityObject.stop();
		});
	}
}

export const multiCollabDataObjectFactory = new DataObjectFactory(
	MultiCollabDataObject.type,
	MultiCollabDataObject,
	[SharedCounter.getFactory(), SharedMap.getFactory()],
	{},
	[[LeafDataObject.type, Promise.resolve(leafDataObjectFactory)]],
);

/**
 * Root data object that creates a single collab and a multi collab data object and runs them.
 */
export class RootDataObject extends DataObject {
	public static get type(): string {
		return "RootDataObject";
	}

	private readonly singleCollabDataObjectKey = "singleCollabDataObject";
	private readonly multiCollabDataObjectKey = "multiCollabDataObject";

	private singleCollabDataObject: IGCActivityObject | undefined;
	private multiCollabDataObject: IGCActivityObject | undefined;

	protected async initializingFirstTime(): Promise<void> {
		await super.initializingFirstTime();

		const nonCollabDataObject = await singleCollabDataObjectFactory.createChildInstance(
			this.context,
		);
		this.root.set<IFluidHandle>(this.singleCollabDataObjectKey, nonCollabDataObject.handle);

		const collabDataObject = await multiCollabDataObjectFactory.createChildInstance(
			this.context,
		);
		this.root.set<IFluidHandle>(this.multiCollabDataObjectKey, collabDataObject.handle);
	}

	public async run(config: IRunConfig): Promise<boolean> {
		const nonCollabDataObjectHandle = this.root.get<IFluidHandle<IGCActivityObject>>(
			this.singleCollabDataObjectKey,
		);
		assert(nonCollabDataObjectHandle !== undefined, "Single collab data object not present");
		this.singleCollabDataObject = await nonCollabDataObjectHandle.get();

		const collabDataObjectHandle = this.root.get<IFluidHandle<IGCActivityObject>>(
			this.multiCollabDataObjectKey,
		);
		assert(collabDataObjectHandle !== undefined, "Multi collab data object not present");
		this.multiCollabDataObject = await collabDataObjectHandle.get();

		/**
		 * Adjust the op rate and total send count for each data object.
		 * - Each data object sends half the number of ops per min.
		 * - Each data object sends half the total number of ops.
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
		await delay(approxDelayMs * config.random.real(1, 1.5));
		const child1RunP = this.singleCollabDataObject.run(
			childConfig,
			`client${config.runId + 1}SingleCollab`,
		);

		await delay(approxDelayMs * config.random.real(1, 1.5));
		const child2RunP = this.multiCollabDataObject.run(
			childConfig,
			`client${config.runId + 1}MultiCollab`,
		);

		return Promise.all([child1RunP, child2RunP]).then(([child1Result, child2Result]) => {
			return child1Result.done && child2Result.done;
		});
	}

	public stop() {
		this.singleCollabDataObject?.stop();
		this.multiCollabDataObject?.stop();
	}
}

export const rootDataObjectFactory = new DataObjectFactory(
	RootDataObject.type,
	RootDataObject,
	[SharedCounter.getFactory()],
	{},
	[
		[SingleCollabDataObject.type, Promise.resolve(singleCollabDataObjectFactory)],
		[MultiCollabDataObject.type, Promise.resolve(multiCollabDataObjectFactory)],
	],
);

const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
	runtime.IFluidHandleContext.resolveHandle(request);

export const createGCFluidExport = (options: IContainerRuntimeOptions) =>
	new ContainerRuntimeFactoryWithDefaultDataStore(
		rootDataObjectFactory,
		[[rootDataObjectFactory.type, Promise.resolve(rootDataObjectFactory)]],
		undefined,
		[innerRequestHandler],
		options,
	);
