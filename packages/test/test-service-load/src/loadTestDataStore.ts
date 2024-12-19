/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";

import { IRandom } from "@fluid-private/stochastic-test-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import { ILoaderOptions } from "@fluidframework/container-definitions/internal";
import {
	// eslint-disable-next-line import/no-deprecated -- ContainerRuntime class to be moved to internal scope
	ContainerRuntime,
	IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, delay } from "@fluidframework/core-utils/internal";
import { ISharedCounter, SharedCounter } from "@fluidframework/counter/internal";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	IDirectory,
	ISharedDirectory,
	ISharedMap,
	SharedMap,
} from "@fluidframework/map/internal";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import { toDeltaManagerInternal } from "@fluidframework/runtime-utils/internal";
import { ITaskManager, TaskManager } from "@fluidframework/task-manager/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import type { TestConfiguration } from "./testConfigFile.js";
import { printStatus } from "./utils.js";
import { VirtualDataStoreFactory, type VirtualDataStore } from "./virtualDataStore.js";

export interface IRunConfig {
	runId: number;
	profileName: string;
	testConfig: TestConfiguration;
	verbose: boolean;
	random: IRandom;
	logger: ITelemetryLoggerExt;
	loaderConfig?: ILoaderOptions;
}

export interface ILoadTest {
	run(config: IRunConfig, reset: boolean): Promise<boolean>;
	detached(
		config: Omit<IRunConfig, "runId" | "profileName">,
	): Promise<LoadTestDataStoreModel | undefined>;
	getRuntime(): Promise<IFluidDataStoreRuntime | undefined>;
}

const taskManagerKey = "taskManager";
const counterKey = "counter";
const sharedMapKey = "sharedMap";
const dataStoresSharedMapKey = "dataStoresSharedMap";
const startTimeKey = "startTime";
const taskTimeKey = "taskTime";
const gcDataStoreKey = "dataStore";
const defaultBlobSize = 1024;

/**
 * Encapsulate the data model and to not expose raw DSS to the main loop.
 * Eventually this can  spawn isolated sub-dirs for workloads,
 * and provide common abstractions for workload scheduling
 * via task picking.
 */
class LoadTestDataStoreModel {
	private static async waitForCatchupOrDispose(
		runtime: IFluidDataStoreRuntime,
	): Promise<void> {
		await new Promise<void>((resolve) => {
			const resolveIfConnectedOrDisposed = () => {
				if (runtime.connected || runtime.disposed) {
					runtime.off("dispose", resolveIfConnectedOrDisposed);
					runtime.off("connected", resolveIfConnectedOrDisposed);
					resolve();
				}
			};
			runtime.once("connected", resolveIfConnectedOrDisposed);
			runtime.once("dispose", resolveIfConnectedOrDisposed);
			resolveIfConnectedOrDisposed();
		});

		const deltaManager = toDeltaManagerInternal(runtime.deltaManager);
		const lastKnownSeq = deltaManager.lastKnownSeqNumber;
		assert(
			deltaManager.lastSequenceNumber <= lastKnownSeq,
			"lastKnownSeqNumber should never be below last processed sequence number",
		);

		await new Promise<void>((resolve) => {
			const resolveIfDisposedOrCaughtUp = (op?: ISequencedDocumentMessage) => {
				if (runtime.disposed || (op !== undefined && lastKnownSeq <= op.sequenceNumber)) {
					deltaManager.off("op", resolveIfDisposedOrCaughtUp);
					runtime.off("dispose", resolveIfDisposedOrCaughtUp);
					resolve();
				}
			};

			deltaManager.on("op", resolveIfDisposedOrCaughtUp);
			runtime.once("dispose", resolveIfDisposedOrCaughtUp);
			resolveIfDisposedOrCaughtUp();
		});
	}

	/**
	 * For GC testing - We create a data store for each client pair. The url of the data store is stored in a key
	 * common to both the clients. Each client adds a reference to this data store when it becomes a writer
	 * and removes the reference before it transitions to a reader.
	 * So, at any point in time, the data store can have 0, 1 or 2 references.
	 */
	private static async getGCDataStore(
		config: IRunConfig,
		root: ISharedDirectory,
		containerRuntime: IContainerRuntimeBase,
	): Promise<LoadTestDataStore> {
		const halfClients = Math.floor(config.testConfig.numClients / 2);
		const gcDataStoreIdKey = `gc_dataStore_${config.runId % halfClients}`;
		let gcDataStore: LoadTestDataStore | undefined;
		if (!root.has(gcDataStoreIdKey)) {
			// The data store for this pair doesn't exist, create it and store its url.
			gcDataStore =
				await LoadTestDataStoreInstantiationFactory.createInstance(containerRuntime);
			// Force the new data store to be attached.
			root.set("Fake", gcDataStore.handle);
			root.delete("Fake");
			root.set(gcDataStoreIdKey, gcDataStore.id);
		}
		// If we did not create the data store above, load it by getting its url.
		if (gcDataStore === undefined) {
			const gcDataStoreId = root.get(gcDataStoreIdKey);
			// eslint-disable-next-line import/no-deprecated -- ContainerRuntime class to be moved to internal scope
			const response = await (containerRuntime as ContainerRuntime).resolveHandle({
				url: `/${gcDataStoreId}`,
			});
			if (response.status !== 200 || response.mimeType !== "fluid/object") {
				throw new Error("GC data store not available");
			}
			gcDataStore = response.value as LoadTestDataStore;
		}
		return gcDataStore;
	}

	public static async createRunnerInstance(
		config: IRunConfig,
		reset: boolean,
		root: ISharedDirectory,
		runtime: IFluidDataStoreRuntime,
		containerRuntime: IContainerRuntimeBase,
	) {
		await LoadTestDataStoreModel.waitForCatchupOrDispose(runtime);
		if (runtime.disposed) {
			return;
		}

		if (!root.hasSubDirectory(config.runId.toString())) {
			root.createSubDirectory(config.runId.toString());
		}
		const runDir = root.getSubDirectory(config.runId.toString());
		if (runDir === undefined) {
			throw new Error(`runDir for runId ${config.runId} not available`);
		}

		if (!runDir.has(counterKey)) {
			runDir.set(counterKey, SharedCounter.create(runtime).handle);
			runDir.set(startTimeKey, Date.now());
		}
		if (!runDir.has(sharedMapKey)) {
			runDir.set(sharedMapKey, SharedMap.create(runtime).handle);
		}

		const counter = await runDir.get<IFluidHandle<ISharedCounter>>(counterKey)?.get();
		const taskmanager = await root.get<IFluidHandle<ITaskManager>>(taskManagerKey)?.get();
		const sharedmap = await runDir.get<IFluidHandle<ISharedMap>>(sharedMapKey)?.get();
		const dataStoresSharedMap = await root
			.get<IFluidHandle<ISharedMap>>(dataStoresSharedMapKey)
			?.get();

		if (counter === undefined) {
			throw new Error("counter not available");
		}
		if (taskmanager === undefined) {
			throw new Error("taskmanager not available");
		}
		if (sharedmap === undefined) {
			throw new Error("sharedmap not available");
		}
		if (dataStoresSharedMap === undefined) {
			throw new Error("dataStoresSharedMap not available");
		}

		const gcDataStore = await this.getGCDataStore(config, root, containerRuntime);

		const dataModel = new LoadTestDataStoreModel(
			root,
			config,
			runtime,
			taskmanager,
			runDir,
			counter,
			sharedmap,
			runDir,
			gcDataStore.handle,
			containerRuntime,
			dataStoresSharedMap,
		);

		if (reset) {
			await LoadTestDataStoreModel.waitForCatchupOrDispose(runtime);
			runDir.set(startTimeKey, Date.now());
			runDir.delete(taskTimeKey);
			counter.increment(-1 * counter.value);
			const partnerCounter = await dataModel.getPartnerCounter();
			if (partnerCounter !== undefined && partnerCounter.value > 0) {
				partnerCounter.increment(-1 * partnerCounter.value);
			}
		}
		if (runtime.disposed) {
			return;
		}
		return dataModel;
	}

	private readonly taskId: string;
	private readonly partnerId: number;
	private taskStartTime: number = 0;

	private readonly isBlobWriter: boolean;
	private readonly blobUploads: Promise<void>[] = [];
	private blobCount = 0;

	private constructor(
		private readonly root: ISharedDirectory,
		private readonly config: IRunConfig,
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly taskManager: ITaskManager,
		private readonly dir: IDirectory,
		public readonly counter: ISharedCounter,
		public readonly sharedmap: ISharedMap,
		private readonly runDir: IDirectory,
		private readonly gcDataStoreHandle: IFluidHandle,
		public readonly containerRuntime: IContainerRuntimeBase,
		public readonly dataStoresSharedMap: ISharedMap,
	) {
		const halfClients = Math.floor(this.config.testConfig.numClients / 2);
		// The runners are paired up and each pair shares a single taskId
		this.taskId = `op_sender${config.runId % halfClients}`;
		this.partnerId = (this.config.runId + halfClients) % this.config.testConfig.numClients;
		const changed = (taskId) => {
			this.deferUntilConnected(
				() => {
					if (taskId === this.taskId && this.taskStartTime !== 0) {
						this.dir.set(taskTimeKey, this.totalTaskTime);
						this.taskStartTime = 0;
					}
				},
				(error) => {
					if (!runtime.disposed) {
						this.config.logger.sendErrorEvent(
							{ eventName: "TaskManager_OnValueChanged" },
							error,
						);
					}
				},
			);
		};
		this.taskManager.on("lost", changed);
		this.taskManager.on("assigned", changed);

		// calculate the number of blobs we will upload
		const clientBlobCount =
			Math.trunc((config.testConfig.totalBlobCount ?? 0) / config.testConfig.numClients) +
			(this.config.runId <
			(config.testConfig.totalBlobCount ?? 0) % config.testConfig.numClients
				? 1
				: 0);
		this.isBlobWriter = clientBlobCount > 0;
		if (this.isBlobWriter) {
			const clientOpCount = config.testConfig.totalSendCount / config.testConfig.numClients;
			const blobsPerOp = clientBlobCount / clientOpCount;

			// start uploading blobs where we left off
			this.blobCount = Math.trunc(this.counter.value * blobsPerOp);

			// upload blobs progressively as the counter is incremented
			this.counter.on("op", (_, local) =>
				this.deferUntilConnected(
					() => {
						const value = this.counter.value;
						if (!local) {
							// this is an old op, we should have already uploaded this blob
							this.blobCount = Math.max(this.blobCount, Math.trunc(value * blobsPerOp));
							return;
						}
						const newBlobs =
							value >= clientOpCount
								? clientBlobCount - this.blobCount
								: Math.trunc(value * blobsPerOp - this.blobCount);

						if (newBlobs > 0) {
							this.blobUploads.push(
								...[...Array(newBlobs)].map(async () => this.writeBlob(this.blobCount++)),
							);
						}
					},
					(error) => {
						if (!runtime.disposed) {
							this.config.logger.sendErrorEvent({ eventName: "Counter_OnOp" }, error);
						}
					},
				),
			);
		}

		// download any blobs our partner may upload
		const partnerBlobCount =
			Math.trunc(config.testConfig.totalBlobCount ?? 0 / config.testConfig.numClients) +
			(this.partnerId < (config.testConfig.totalBlobCount ?? 0 % config.testConfig.numClients)
				? 1
				: 0);

		const readBlob = (key: string) => {
			if (key.startsWith(this.partnerBlobKeyPrefix)) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				this.root
					.get<IFluidHandle>(key)!
					.get()
					.catch((error) => {
						if (!runtime.disposed) {
							this.config.logger.sendErrorEvent(
								{
									eventName: "ReadBlobFailed_OnValueChanged",
									key,
								},
								error,
							);
						}
					});
			}
		};
		if (partnerBlobCount > 0) {
			this.root.on("valueChanged", (v) => readBlob(v.key));
		}
		// additional loop of readBlob in case the eventlistener won't fire when container is closed.
		for (const key of this.root.keys()) {
			readBlob(key);
		}
	}

	private deferUntilConnected(callback: () => void, errorHandler: (error) => void) {
		Promise.resolve()
			.then(() => {
				if (this.runtime.connected) {
					callback();
				} else {
					this.runtime.once("connected", () => {
						callback();
					});
				}
			})
			.catch((error) => errorHandler(error));
	}

	public get startTime(): number {
		return this.dir.get<number>(startTimeKey) ?? Date.now();
	}
	public get totalTaskTime(): number {
		return (this.dir.get<number>(taskTimeKey) ?? 0) + this.currentTaskTime;
	}
	public get currentTaskTime(): number {
		return Date.now() - (this.assigned() ? this.taskStartTime : this.startTime);
	}

	private blobKey(id): string {
		return `blob_${this.config.runId}_${id}`;
	}
	private get partnerBlobKeyPrefix(): string {
		return `blob_${this.partnerId}_`;
	}

	public async blobFinish() {
		const p = Promise.all(this.blobUploads);
		this.blobUploads.length = 0;
		return p;
	}

	/**
	 * Upload a unique attachment blob and store the handle in a unique key on the root map
	 */
	public async writeBlob(blobNumber: number) {
		if (this.runtime.disposed) {
			return;
		}
		const blobSize = this.config.testConfig.blobSize ?? defaultBlobSize;
		// upload a unique blob, since they may be deduped otherwise
		const buffer = Buffer.alloc(blobSize, `${this.config.runId}/${blobNumber}:`);
		assert(buffer.byteLength === blobSize, "incorrect buffer size");
		const handle = await this.runtime.uploadBlob(buffer);
		if (!this.runtime.disposed) {
			this.root.set(this.blobKey(blobNumber), handle);
		}
	}

	public async getPartnerCounter() {
		if (this.runtime.disposed) {
			return undefined;
		}
		const dir = this.root.getSubDirectory(this.partnerId.toString());
		if (dir === undefined) {
			return undefined;
		}
		const handle = dir.get<IFluidHandle<ISharedCounter>>(counterKey);
		if (handle === undefined) {
			return undefined;
		}
		return handle.get();
	}

	public assigned() {
		if (this.runtime.disposed) {
			return false;
		}
		return this.taskManager.assigned(this.taskId);
	}

	public abandonTask() {
		if (this.assigned()) {
			// We are becoming the reader. Remove the reference to the GC data store.
			this.runDir.delete(gcDataStoreKey);
			this.taskManager.abandon(this.taskId);
		}
	}

	public async volunteerForTask() {
		if (this.runtime.disposed) {
			return;
		}
		if (!this.assigned()) {
			try {
				if (!this.runtime.connected) {
					await new Promise<void>((resolve, reject) => {
						const resAndClear = () => {
							resolve();
							this.runtime.off("connected", resAndClear);
							this.runtime.off("disconnected", rejAndClear);
							this.runtime.off("dispose", rejAndClear);
						};
						const rejAndClear = () => {
							reject(new Error("failed to connect"));
							resAndClear();
						};
						this.runtime.once("connected", resAndClear);
						this.runtime.once("dispose", rejAndClear);
						this.runtime.once("disconnected", rejAndClear);
					});
				}
				await this.taskManager.volunteerForTask(this.taskId);
				this.taskStartTime = Date.now();

				// We just became the writer. Add a reference to the GC data store.
				if (!this.runDir.has(gcDataStoreKey)) {
					this.runDir.set(gcDataStoreKey, this.gcDataStoreHandle);
				}
			} catch (e) {
				if (this.runtime.disposed || !this.runtime.connected) {
					return;
				}
				throw e;
			}
		}
	}

	public printStatus() {
		if (this.config.verbose) {
			const formatBytes = (bytes: number, decimals = 1): string => {
				if (bytes === 0) {
					return "0 B";
				}
				const i = Math.floor(Math.log(bytes) / Math.log(1024));
				return `${(bytes / Math.pow(1024, i)).toFixed(decimals)} ${" KMGTPEZY"[i]}B`;
			};
			const now = Date.now();
			const totalMin = (now - this.startTime) / 60000;
			const taskMin = this.totalTaskTime / 60000;

			const deltaManager = toDeltaManagerInternal(this.runtime.deltaManager);
			const opCount = deltaManager.lastKnownSeqNumber;
			const opRate = Math.floor(deltaManager.lastKnownSeqNumber / totalMin);
			const sendRate = Math.floor(this.counter.value / taskMin);
			const disposed = this.runtime.disposed;
			const blobsEnabled = (this.config.testConfig.totalBlobCount ?? 0) > 0;
			const blobSize = this.config.testConfig.blobSize ?? defaultBlobSize;
			console.log(
				`${this.config.runId.toString().padStart(3)}>` +
					` seen: ${opCount.toString().padStart(8)} (${opRate.toString().padStart(4)}/min),` +
					` sent: ${this.counter.value.toString().padStart(8)} (${sendRate
						.toString()
						.padStart(2)}/min),` +
					` run time: ${taskMin.toFixed(2).toString().padStart(5)} min`,
				` total time: ${totalMin.toFixed(2).toString().padStart(5)} min`,
				`hasTask: ${this.assigned().toString().padStart(5)}`,
				blobsEnabled ? `blobWriter: ${this.isBlobWriter.toString().padStart(5)}` : "",
				blobsEnabled
					? `blobs uploaded: ${formatBytes(this.blobCount * blobSize).padStart(8)}`
					: "",
				!disposed ? `audience: ${this.runtime.getAudience().getMembers().size}` : "",
				!disposed ? `quorum: ${this.runtime.getQuorum().getMembers().size}` : "",
			);
		}
	}
}

class LoadTestDataStore extends DataObject implements ILoadTest {
	public static DataStoreName = "StressTestDataStore";

	protected async initializingFirstTime() {
		this.root.set(taskManagerKey, TaskManager.create(this.runtime).handle);
		const virtualDataStore = await VirtualDataStoreFactory.createInstance(
			this.context.containerRuntime,
			undefined,
			"0",
		);
		this.root.set("0", virtualDataStore.handle);
		const dataStoresMap = SharedMap.create(this.runtime);
		this.root.set(dataStoresSharedMapKey, dataStoresMap.handle);
		dataStoresMap.set("0", virtualDataStore.handle);
	}

	public async detached(config: Omit<IRunConfig, "runId">) {
		return LoadTestDataStoreModel.createRunnerInstance(
			{ ...config, runId: -1 },
			false,
			this.root,
			this.runtime,
			this.context.containerRuntime,
		);
	}

	public async run(config: IRunConfig, reset: boolean) {
		const dataModel = await LoadTestDataStoreModel.createRunnerInstance(
			config,
			reset,
			this.root,
			this.runtime,
			this.context.containerRuntime,
		);
		if (dataModel === undefined) {
			return false;
		}

		// At every moment, we want half the client to be concurrent writers, and start and stop
		// in a rotation fashion for every cycle.
		// To set that up we start each client in a staggered way, each will independently go thru write
		// and listen cycles

		let timeout: NodeJS.Timeout | undefined;
		if (config.verbose) {
			const printProgress = () => {
				dataModel.printStatus();
				timeout = setTimeout(printProgress, config.testConfig.progressIntervalMs);
			};
			timeout = setTimeout(printProgress, config.testConfig.progressIntervalMs);
		}

		let runResult: [boolean, void];
		try {
			const opsRun = this.sendOps(dataModel, config);
			const signalsRun = this.sendSignals(config);
			// runResult is of type [boolean, void] as we return boolean for Ops alone based on runtime.disposed value
			runResult = await Promise.all([opsRun, signalsRun]);
		} finally {
			if (timeout !== undefined) {
				clearTimeout(timeout);
			}
		}
		return runResult[0];
	}

	async getRuntime() {
		if (!this.runtime.disposed) {
			return this.runtime;
		}
	}

	async sendOps(dataModel: LoadTestDataStoreModel, config: IRunConfig) {
		const cycleMs = config.testConfig.readWriteCycleMs;
		const clientSendCount = config.testConfig.totalSendCount / config.testConfig.numClients;
		const opsSendType = config.testConfig.opsSendType ?? "staggeredReadWrite";
		const opsPerCycle = (config.testConfig.opRatePerMin * cycleMs) / 60000;
		const opsGapMs = cycleMs / opsPerCycle;
		const opSizeinBytes =
			typeof config.testConfig.content?.opSizeinBytes === "undefined"
				? 0
				: config.testConfig.content.opSizeinBytes;
		assert(opSizeinBytes >= 0, "opSizeinBytes must be greater than or equal to zero.");

		const generateStringOfSize = (sizeInBytes: number): string =>
			new Array(sizeInBytes + 1).join("0");
		const generateRandomStringOfSize = (sizeInBytes: number): string =>
			crypto.randomBytes(sizeInBytes / 2).toString("hex");
		const generateContentOfSize =
			config.testConfig.content?.useRandomContent === true
				? generateRandomStringOfSize
				: generateStringOfSize;
		const getOpSizeInBytes = () =>
			config.testConfig.content?.useVariableOpSize === true
				? Math.floor(Math.random() * opSizeinBytes)
				: opSizeinBytes;
		const largeOpRate = Math.max(
			Math.floor((config.testConfig.content?.largeOpRate ?? 1) / config.testConfig.numClients),
			1,
		);
		// To avoid having all clients send their large payloads at roughly the same time
		const largeOpJitter = Math.min(config.runId, largeOpRate);
		// To avoid growing the file size unnecessarily, not all clients should be sending large ops
		const maxClientsSendingLargeOps = config.testConfig.content?.numClients ?? 1;

		// Data Virtualization rates
		const maxClientsForVirtualDatastores = config.testConfig.virtualization?.numClients ?? 1;
		const virtualCreateRate =
			config.testConfig.virtualization?.createRate !== undefined
				? config.testConfig.virtualization.createRate / config.testConfig.numClients
				: undefined;
		const virtualLoadRate =
			config.testConfig.virtualization?.loadRate !== undefined
				? config.testConfig.virtualization.loadRate / config.testConfig.numClients
				: undefined;

		let opsSent = 0;
		let largeOpsSent = 0;
		let virtualDataStoresCreated = 0;
		let virtualDataStoresLoaded = 0;

		const reportOpCount = (reason: string, error?: Error) => {
			config.logger.sendTelemetryEvent(
				{
					eventName: "OpCount",
					reason,
					runId: config.runId,
					documentOpCount: dataModel.counter.value,
					localOpCount: opsSent,
					localLargeOpCount: largeOpsSent,
					localVirtualDataStoresCreated: virtualDataStoresCreated,
					virtualDataStoresLoaded,
				},
				error,
			);
		};

		this.runtime.once("dispose", () => reportOpCount("Disposed"));
		this.runtime.once("disconnected", () => reportOpCount("Disconnected"));

		const sendSingleOp = () => {
			if (
				this.shouldSendLargeOp(
					opSizeinBytes,
					largeOpRate,
					opsSent,
					largeOpJitter,
					maxClientsSendingLargeOps,
					config.runId,
				)
			) {
				const opSize = getOpSizeInBytes();
				// The key name matters, as it can directly affect the size of the snapshot.
				// For now, we want to key to be constantly overwritten so that the snapshot size
				// does not grow relative to the number of clients or the frequency of the large ops.
				dataModel.sharedmap.set("largeOpKey", generateContentOfSize(opSize));
				config.logger.sendTelemetryEvent({
					eventName: "LargeTestPayload",
					runId: config.runId,
					largeOpJitter,
					opSize,
					opsSent,
					largeOpRate,
				});

				largeOpsSent++;
			}

			// This creates a virtual data store
			if (
				this.shouldCreateVirtualDataStore(
					virtualCreateRate,
					opsSent,
					maxClientsForVirtualDatastores,
					config.runId,
				)
			) {
				// create virtual data store
				const validGroupIds = dataModel.dataStoresSharedMap.size - 1;
				const groupId = config.random.integer(0, validGroupIds);
				const virtualDataStoreCreation = VirtualDataStoreFactory.createInstance(
					dataModel.containerRuntime,
					undefined,
					groupId.toString(),
				);
				const opsSentCurrent = opsSent;
				virtualDataStoreCreation
					.then((virtualDataStore) => {
						dataModel.dataStoresSharedMap.set(
							`${config.runId}${opsSentCurrent}`,
							virtualDataStore.handle,
						);
						config.logger.sendTelemetryEvent({
							eventName: "VirtualDataStoreCreation",
							runId: config.runId,
							localOpCount: opsSentCurrent,
							virtualCreateRate,
							groupId: virtualDataStore.loadingGroupId,
						});
						virtualDataStoresCreated++;
						printStatus(config, `Virtual data store created`);
					})
					.catch((error) => {
						config.logger.sendErrorEvent(
							{
								eventName: "VirtualDataStoreCreationFailed",
								runId: config.runId,
								localOpCount: opsSentCurrent,
								virtualCreateRate,
							},
							error,
						);
					});
			}

			// This starts loading a virtual data store
			if (
				this.shouldLoadVirtualDataStore(
					virtualLoadRate,
					opsSent,
					maxClientsForVirtualDatastores,
					config.runId,
				)
			) {
				// load random virtual data store
				const dataStoreHandles = Array.from(
					dataModel.dataStoresSharedMap.values(),
				) as IFluidHandle<VirtualDataStore>[];
				const handle = config.random.pick(dataStoreHandles);
				const opsSentCurrent = opsSent;
				const loadStartMs = Date.now();
				handle
					.get()
					.then((virtualDataStore) => {
						const loadEndMs = Date.now();
						config.logger.sendTelemetryEvent({
							eventName: "VirtualDataStoreLoaded",
							runId: config.runId,
							localOpCount: opsSentCurrent,
							virtualLoadRate,
							groupId: virtualDataStore.loadingGroupId,
							loadTimeMs: loadEndMs - loadStartMs,
						});
						printStatus(config, `Virtual data store loaded`);
						virtualDataStoresLoaded++;
					})
					.catch((error) => {
						config.logger.sendErrorEvent(
							{
								eventName: "VirtualDataStoreLoadFailed",
								runId: config.runId,
								localOpCount: opsSentCurrent,
								virtualLoadRate,
							},
							error,
						);
					});
			}

			dataModel.counter.increment(1);
			opsSent++;
		};

		const enableQuickRampDown = () => {
			return opsSendType === "staggeredReadWrite" && opSizeinBytes === 0 ? true : false;
		};

		const sendSingleOpAndThenWait =
			opsSendType === "staggeredReadWrite"
				? async () => {
						if (dataModel.assigned()) {
							sendSingleOp();
							if (opsSent % opsPerCycle === 0) {
								dataModel.abandonTask();
								await delay(cycleMs / 2);
							} else {
								await delay(opsGapMs * config.random.real(1, 1.5));
							}
						} else {
							await dataModel.volunteerForTask();
						}
					}
				: async () => {
						sendSingleOp();
						await delay(opsGapMs * config.random.real(1, 1.5));
					};

		try {
			while (dataModel.counter.value < clientSendCount && !this.runtime.disposed) {
				// this enables a quick ramp down. due to restart, some clients can lag
				// leading to a slow ramp down. so if there are less than half the clients
				// and it's partner is done, return true to complete the runner.
				if (enableQuickRampDown()) {
					if (
						this.runtime.getAudience().getMembers().size < config.testConfig.numClients / 2 &&
						((await dataModel.getPartnerCounter())?.value ?? 0) >= clientSendCount
					) {
						return true;
					}
				}
				await sendSingleOpAndThenWait();
			}

			const doneSendingOps = !this.runtime.disposed;
			reportOpCount(doneSendingOps ? "Completed" : "Not Completed");
			return doneSendingOps;
		} catch (error: any) {
			reportOpCount("Exception", error);
			throw error;
		} finally {
			dataModel.printStatus();
		}
	}

	/**
	 * To avoid creating huge files on the server, the test should self-throttle
	 *
	 * @param opSizeinBytes - configured max size of op contents
	 * @param largeOpRate - how often should a regular op be large op
	 * @param opsSent - how many ops (of any type) already sent
	 * @param largeOpJitter - to avoid clients sending large ops at the same time
	 * @param maxClients - how many clients should be sending large ops
	 * @param runId - run id of the current test
	 * @returns true if a large op should be sent, false otherwise
	 */
	private shouldSendLargeOp(
		opSizeinBytes: number,
		largeOpRate: number,
		opsSent: number,
		largeOpJitter: number,
		maxClients: number,
		runId: number,
	) {
		return (
			runId < maxClients &&
			opSizeinBytes > 0 &&
			largeOpRate > 0 &&
			opsSent % largeOpRate === largeOpJitter
		);
	}

	/**
	 * @param createRate - how often should a virtual data store be created, every so op count
	 * @param jitter - how much jitter to add to the create rate. Jitter was added so creates didn't happen at the same time
	 * @param opsSent - how many ops have been sent by the client
	 * @param maxClients - how many clients should be creating virtual data stores
	 * @param runId - run id of the current test
	 * @returns true if a virtual data store should be created, false otherwise
	 */
	private shouldCreateVirtualDataStore(
		createRate: number | undefined,
		opsSent: number,
		maxClients: number,
		runId: number,
	) {
		return runId < maxClients && createRate !== undefined && opsSent % createRate === 0;
	}

	/**
	 *
	 * @param loadRate - how often should a virtual data store be loaded, every so op count
	 * @param opsSent - how many ops have been sent by the client
	 * @param maxClients - how many clients should be creating virtual data stores
	 * @param runId - run id of the current test
	 * @returns true if a virtual data store should be loaded, false otherwise
	 */
	private shouldLoadVirtualDataStore(
		loadRate: number | undefined,
		opsSent: number,
		maxClients: number,
		runId: number,
	) {
		return runId < maxClients && loadRate !== undefined && opsSent % loadRate === 0;
	}

	async sendSignals(config: IRunConfig) {
		const clientSignalsSendCount =
			typeof config.testConfig.totalSignalsSendCount === "undefined"
				? 0
				: config.testConfig.totalSignalsSendCount / config.testConfig.numClients;
		const cycleMs = config.testConfig.readWriteCycleMs;
		const signalsPerCycle =
			typeof config.testConfig.signalsPerMin === "undefined"
				? 0
				: (config.testConfig.signalsPerMin * cycleMs) / 60000;
		const signalsGapMs = cycleMs / signalsPerCycle;
		let submittedSignals = 0;
		try {
			while (submittedSignals < clientSignalsSendCount && !this.runtime.disposed) {
				// all the clients are sending signals;
				// with signals, there is no particular need to have staggered writers and readers
				if (this.runtime.connected) {
					this.runtime.submitSignal("generic-signal", true);
					submittedSignals++;
				}
				// Random jitter of +- 50% of signalGapMs
				await delay(signalsGapMs * config.random.real(1, 1.5));
			}
		} catch (e) {
			console.error("Error during submitting signals: ", e);
		}
	}
}

const LoadTestDataStoreInstantiationFactory = new DataObjectFactory(
	LoadTestDataStore.DataStoreName,
	LoadTestDataStore,
	[SharedCounter.getFactory(), TaskManager.getFactory()],
	{},
);

export const createFluidExport = (runtimeOptions?: IContainerRuntimeOptions | undefined) =>
	new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: LoadTestDataStoreInstantiationFactory,
		registryEntries: [
			LoadTestDataStoreInstantiationFactory.registryEntry,
			VirtualDataStoreFactory.registryEntry,
		],
		runtimeOptions,
	});
