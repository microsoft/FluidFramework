/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, delay } from "@fluidframework/core-utils";
import { SharedCounter } from "@fluidframework/counter";
import { SharedMap } from "@fluidframework/map";
import { ITelemetryGenericEventExt, ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { IRunConfig, ITestRunner, TestRunResult } from "../../testConfigFile";

/**
 * The maximum number of leaf data objects that can be created.
 */
const maxLeafDataObjects = 10;

/**
 * The maximum number of DDS that a leaf data object can create.
 */
const maxLeafDataObjectDDS = 10;

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
export interface IActivityObject {
	run: (config: IRunConfig, nodeId: string) => Promise<ActivityRunResult>;
	stop: () => void;
}

/**
 * Activities that can be performed by the root data object.
 */
const RootActivityType = {
	/** Don't do anything. */
	None: 0,
	/** Another don't do anything activity to ensure that data stores are not created too frequently. */
	AnotherNone: 1,
	/** Create a new data store. */
	Create: 2,
	/** The count of enum values. This is used as the max value for generating an activity at random. */
	Count: 3,
};
type RootActivityType = (typeof RootActivityType)[keyof typeof RootActivityType];

/**
 * Activities that can be performed by the leaf data object.
 */
const LeafActivityType = {
	/** Don't do anything. */
	None: 0,
	/** Another don't do anything activity to ensure that creation / changes don't happen too frequently. */
	AnotherNone: 1,
	/** Update one of the DDSes in the data object. */
	UpdateOneDDS: 2,
	/** Update all the DDSes in the data object. */
	UpdateTwoDDS: 3,
	/** Create a new DDS. */
	Create: 4,
	/** The count of enum values. This is used as the max value for generating an activity at random. */
	Count: 5,
};
type LeafActivityType = (typeof LeafActivityType)[keyof typeof LeafActivityType];

function logEvent(logger: ITelemetryLoggerExt, props: ITelemetryGenericEventExt & { id?: string }) {
	logger.sendTelemetryEvent(props);
	const toId = props.id !== undefined ? `-> ${props.id}` : "";
	console.log(`########## ${props.eventName}: ${props.fromId} ${toId}`);
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
 * Data object that should be the leaf in the data object hierarchy. This does one of the activities in
 * "LeafActivityType" at regular intervals.
 */
export class LeafDataObject extends DataObject implements IActivityObject {
	public static type = "LeafDataObject";
	private running: boolean = false;
	private _nodeId: string | undefined;
	private get nodeId(): string {
		assert(this._nodeId !== undefined, "id accessed before run");
		return this._nodeId;
	}
	private activityFailed: boolean = false;
	private activityFailedError: any;

	private _logger: ITelemetryLoggerExt | undefined;
	private get logger(): ITelemetryLoggerExt {
		assert(this._logger !== undefined, "Logger must be available");
		return this._logger;
	}

	private readonly localCounters: SharedCounter[] = [];

	/**
	 * At startup, get the counters from the root map and add it to the local counters list.
	 */
	private async initializeCounters() {
		for (const [, value] of this.root) {
			const counterHandle = value as IFluidHandle<SharedCounter>;
			this.localCounters.push(await counterHandle.get());
		}
	}

	/**
	 * At startup, set up an event handler that listens for "valueChanged" event from other clients.
	 * It adds any counters added by other clients to its local counter list.
	 */
	private setupEventHandler() {
		this.root.on("valueChanged", (changed, local) => {
			if (local) {
				return;
			}
			const counterHandle = this.root.get<IFluidHandle<SharedCounter>>(changed.key);
			if (counterHandle !== undefined) {
				counterHandle
					.get()
					.then((counter) => {
						this.localCounters.push(counter);
					})
					.catch((error) => {
						this.activityFailed = true;
						this.activityFailedError = error;
					});
			}
		});
	}

	public async run(config: IRunConfig, nodeId: string): Promise<ActivityRunResult> {
		if (this.running) {
			return { done: true };
		}
		this.running = true;
		this._nodeId = nodeId;
		this._logger = config.logger;

		// Set up event handler and initialize local counter.
		this.setupEventHandler();
		await this.initializeCounters();

		const delayBetweenActivityMs = Math.ceil((60 * 1000) / config.testConfig.opRatePerMin);
		while (this.running && !this.runtime.disposed && !this.activityFailed) {
			try {
				this.runActivity(config);
			} catch (e) {
				this.activityFailed = true;
				this.activityFailedError = e;
				break;
			}
			// Random jitter of +- 50% of delayBetweenActivityMs so that all clients don't do this at the same time.
			await delay(delayBetweenActivityMs * config.random.real(1, 1.5));
		}
		this.stop();
		return { done: !this.activityFailed, error: this.activityFailedError, nodeId };
	}

	public stop() {
		this.running = false;
	}

	private get counterSize(): number {
		return this.localCounters.length;
	}

	// Increments a random counter from the local counter list.
	private incrementRandomCounter(config: IRunConfig) {
		const index = config.random.integer(0, this.counterSize - 1);
		const counter = this.localCounters.at(index);
		assert(counter !== undefined, `Could not find counter at index ${index}`);
		logEvent(this.logger, {
			eventName: "DDS*",
			fromId: this.nodeId,
			id: counter.id,
		});
		counter.increment(1);
	}

	/**
	 * Runs one of the following activity at random:
	 * 1. UpdateOneDDS - Updates one of the DDSes by sending ops for it. When this happens, chances are that the other
	 * DDS will do incremental summary in the next summary which is an important scenario to test.
	 * 2. UpdateAllDDS - Updates all the DDSes by sending ops for them.
	 * 2. None - Do nothing. This is to have summaries where this data store or its DDS does not change.
	 */
	private runActivity(config: IRunConfig) {
		let activityType: number;
		if (this.counterSize === 0) {
			activityType = LeafActivityType.Create;
		} else {
			const maxActivityIndex =
				this.counterSize < maxLeafDataObjectDDS
					? LeafActivityType.Count - 1
					: LeafActivityType.Create - 1;
			activityType = config.random.integer(0, maxActivityIndex);
		}
		switch (activityType) {
			case LeafActivityType.UpdateOneDDS: {
				// Increment a random counter.
				this.incrementRandomCounter(config);
				break;
			}
			case LeafActivityType.UpdateTwoDDS: {
				// Increment 2 random counters.
				this.incrementRandomCounter(config);
				this.incrementRandomCounter(config);
				break;
			}
			case LeafActivityType.Create: {
				const counter = SharedCounter.create(this.runtime);
				logEvent(this.logger, {
					eventName: "DDS+",
					fromId: this.nodeId,
					id: counter.id,
				});
				this.root.set<IFluidHandle>(counter.id, counter.handle);
				this.localCounters.push(counter);
				break;
			}
			case LeafActivityType.None:
			case LeafActivityType.AnotherNone:
				logEvent(this.logger, {
					eventName: "DDS-",
					fromId: this.nodeId,
				});
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
 * Data object that is the root in the data object hierarchy. This does one of the activities in
 * "RootActivityType" at regular intervals.
 */
export class RootDataObject extends BaseDataObject implements ITestRunner {
	public static type = "SummaryStressDataObject";

	public get ITestRunner() {
		return this;
	}

	private get nodeId(): string {
		assert(this._nodeId !== undefined, "id accessed before run");
		return this._nodeId;
	}
	private _nodeId: string | undefined;
	private running: boolean = false;
	private activityFailed: boolean = false;

	/**
	 * The config with which to run data objects.
	 * Note: This should not be called before "run" is called which initializes it.
	 */
	private _childRunConfig: IRunConfig | undefined;
	private get childRunConfig(): IRunConfig {
		assert(this._childRunConfig !== undefined, "Run config must be available");
		return this._childRunConfig;
	}

	private _logger: ITelemetryLoggerExt | undefined;
	private get logger(): ITelemetryLoggerExt {
		assert(this._logger !== undefined, "Logger must be available");
		return this._logger;
	}

	/**
	 * The map that stores the Fluid handles to all child data objects.
	 * Note: This should not be called before "run" is called which initializes it.
	 */
	private readonly dataObjectMapKey = "dataObjectMap";
	private _dataObjectMap: SharedMap | undefined;
	protected get dataObjectMap(): SharedMap {
		assert(
			this._dataObjectMap !== undefined,
			"Data object map cannot be retrieving before initialization",
		);
		return this._dataObjectMap;
	}

	// A local list of all child data objects. This makes it easier to run and stop them synchronously without
	// having to get its handle from the root map and await on getting the data object.
	private readonly localChildDataObjects: Map<string, IActivityObject> = new Map();

	protected async initializingFirstTime(): Promise<void> {
		await super.initializingFirstTime();
		this.root.set<IFluidHandle>(this.dataObjectMapKey, SharedMap.create(this.runtime).handle);
	}

	protected async hasInitialized(): Promise<void> {
		await super.hasInitialized();
		const dataObjectMapHandle = this.root.get<IFluidHandle<SharedMap>>(this.dataObjectMapKey);
		assert(
			dataObjectMapHandle !== undefined,
			"The data object map handle should exist on initialization",
		);
		this._dataObjectMap = await dataObjectMapHandle.get();
	}

	/**
	 * Activity runner that will report any error during the activity run.
	 */
	private activityRunnerReporterSync(
		activityFn: () => Promise<ActivityRunResult>,
		failureEventName: string,
	) {
		activityFn()
			.then((result) => {
				if (!result.done) {
					this.activityFailed = true;
					if (result.error !== undefined) {
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
	 * At startup, get the child data objects from the shared map and it to the local list.
	 */
	private async initializeChildren(): Promise<void> {
		// Run the data objects and blobs that are in the referenced list.
		for (const [key, value] of this.dataObjectMap) {
			const dataObjectHandle = value as IFluidHandle<IActivityObject>;
			this.localChildDataObjects.set(key, await dataObjectHandle.get());
		}
	}

	/**
	 * Runs activity on initial set of child objects, if any.
	 */
	private runInitialActivitySync(): void {
		// Run the data objects and blobs that are in the referenced list.
		for (const [childId, childDataObject] of this.localChildDataObjects) {
			this.activityRunnerReporterSync(
				async () => childDataObject.run(this.childRunConfig, `${this.nodeId}/${childId}`),
				"InitialDSActivityFailed",
			);
		}
	}

	async getRuntime() {
		return this.runtime;
	}

	public async run(config: IRunConfig): Promise<TestRunResult> {
		if (this.running) {
			return { abort: false, done: true };
		}

		this._nodeId = `client${config.runId + 1}`;
		this._logger = config.logger;
		this.running = true;

		/**
		 * Adjust the totalSendCount and opRatePerMin such that this data object and its child data objects collectively
		 * send totalSendCount number of ops at opRatePerMin. There can be maximum of maxLeafDataObjects
		 * running at the same time. So maxDataObjects = maxLeafDataObjects + 1 (this data object).
		 * - Ops per minute sent by this data object and its children is 1/maxDataObjects times the opRatePerMinPerClient.
		 * - totalSendCount of this data objects is 1/maxDataObjects times the totalSendCount as its children are also
		 * sending ops at the same. What this boils down to is that totalSendCount is controlling how long the test
		 * runs since the total number of ops sent may be less than totalSendCount.
		 */
		const maxDataObjects = maxLeafDataObjects + 1;
		const totalSendCount = Math.ceil(config.testConfig.totalSendCount / maxDataObjects);
		const opRatePerMinPerClient = config.testConfig.opRatePerMin / config.testConfig.numClients;
		const opRatePerMin = Math.ceil(opRatePerMinPerClient / maxDataObjects);
		this._childRunConfig = {
			...config,
			testConfig: {
				...config.testConfig,
				opRatePerMin,
				totalSendCount,
			},
		};

		// Initialize the child objects and run their activities.
		await this.initializeChildren();
		this.runInitialActivitySync();

		// Perform an activity every 1/6th minute = every 10 seconds.
		const activityThresholdOpCount = Math.ceil(opRatePerMin / 6);
		const delayBetweenOpsMs = Math.ceil((60 * 1000) / opRatePerMin);
		let localSendCount = 0;
		while (
			this.running &&
			this.counter.value < totalSendCount &&
			!this.runtime.disposed &&
			!this.activityFailed
		) {
			// After every activityThresholdOpCount ops, run activity.
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
		return { abort: false, done: !notDone };
	}

	private stop() {
		this.running = false;
		this.localChildDataObjects.forEach((dataObject: IActivityObject, id: string) => {
			dataObject.stop();
		});
	}

	private runActivity(config: IRunConfig) {
		// If it's possible to create a new object, all activities can be performed upto Create.
		// If not, only activities before Create can be performed.
		const maxActivityIndex =
			this.dataObjectMap.size < maxLeafDataObjects
				? RootActivityType.Count - 1
				: RootActivityType.Create - 1;
		const activityType = config.random.integer(0, maxActivityIndex);
		switch (activityType) {
			case RootActivityType.Create:
				{
					const activityFn = async () => {
						const dataObject = await leafDataObjectFactory.createChildInstance(
							this.context,
						);
						const dataObjectId = `${this.nodeId}/ds-${dataObject.id}`;
						logEvent(this.logger, {
							eventName: "DS+",
							fromId: this.nodeId,
							id: dataObjectId,
						});
						this.dataObjectMap.set(dataObjectId, dataObject.handle);
						this.localChildDataObjects.set(dataObjectId, dataObject);
						return dataObject.run(this.childRunConfig, dataObjectId);
					};
					this.activityRunnerReporterSync(activityFn, "CreateActivityFailed");
				}
				break;
			case RootActivityType.None:
			case RootActivityType.AnotherNone:
				logEvent(this.logger, {
					eventName: "DS-",
					fromId: this.nodeId,
				});
			default:
				break;
		}
	}
}

export const rootDataObjectFactory = new DataObjectFactory(
	RootDataObject.type,
	RootDataObject,
	[SharedCounter.getFactory(), SharedMap.getFactory()],
	{},
	[[LeafDataObject.type, Promise.resolve(leafDataObjectFactory)]],
);
