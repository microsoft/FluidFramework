/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventEmitter, stringToBuffer } from "@fluid-internal/client-utils";
import {
	IGetPendingLocalStateProps,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils/internal";
import {
	FetchSource,
	IResolvedUrl,
	ISnapshot,
	ISnapshotFetchOptions,
	IDocumentAttributes,
	ISnapshotTree,
	IVersion,
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { getSnapshotTree } from "@fluidframework/driver-utils/internal";
import { MockLogger, mixinMonitoringContext } from "@fluidframework/telemetry-utils/internal";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import {
	type IPendingContainerState,
	SerializedStateManager,
	type ISerializedStateManagerDocumentStorageService,
} from "../serializedStateManager.js";

import { failSometimeProxy } from "./failProxy.js";

const snapshot = {
	id: "fromStorage",
	blobs: {},
	trees: {
		".protocol": {
			blobs: { attributes: "attributesId" },
			trees: {},
		},
		".app": {
			blobs: {},
			trees: {},
		},
	},
};

const savedOpsSize = 10;
const savedOps: ISequencedDocumentMessage[] = [];

for (let i = 1; i <= savedOpsSize; i++) {
	savedOps.push(generateSavedOp(i));
}

const pendingLocalState: IPendingContainerState = {
	attached: true,
	baseSnapshot: snapshot,
	snapshotBlobs: { attributesId: '{"minimumSequenceNumber" : 0, "sequenceNumber": 0}' },
	pendingRuntimeState: {},
	savedOps,
	url: "fluid",
};

const eventEmitter = new EventEmitter();

class MockStorageAdapter implements ISerializedStateManagerDocumentStorageService {
	public readonly blobs = new Map<string, ArrayBufferLike>();
	private readonly snapshot: ISnapshotTree;

	constructor(baseSnapshot = snapshot) {
		this.snapshot = baseSnapshot;
		this.blobs.set(
			"attributesId",
			stringToBuffer(`{"minimumSequenceNumber" : 0, "sequenceNumber": 0}`, "utf8"),
		);
	}

	public async updateGroupIdSnapshots(): Promise<void> {}
	public get loadedGroupIdSnapshots(): Record<string, ISnapshot> {
		return {};
	}

	public async getSnapshot(
		_snapshotFetchOptions?: ISnapshotFetchOptions | undefined,
	): Promise<ISnapshot> {
		throw new Error("Method not implemented.");
	}
	public async getSnapshotTree(
		_version?: IVersion | undefined,
		_scenarioName?: string | undefined,
		// eslint-disable-next-line @rushstack/no-new-null
	): Promise<ISnapshotTree | null> {
		return this.snapshot;
	}

	public async getVersions(
		// eslint-disable-next-line @rushstack/no-new-null
		_versionId: string | null,
		_count: number,
		_scenarioName?: string | undefined,
		_fetchSource?: FetchSource | undefined,
	): Promise<IVersion[]> {
		assert.ok(this.snapshot.id);
		return [{ id: this.snapshot.id, treeId: this.snapshot.id }];
	}
	public async readBlob(id: string): Promise<ArrayBufferLike> {
		if (!this.blobs.has(id)) {
			throw new Error("Requested blob does not exist");
		}
		return this.blobs.get(id) as ArrayBufferLike;
	}

	public uploadSummary(sequenceNumber: number): void {
		this.blobs.set(
			"attributesId",
			stringToBuffer(
				`{"minimumSequenceNumber" : 0, "sequenceNumber": ${sequenceNumber}}`,
				"utf8",
			),
		);
	}
}

type ISerializedStateManagerRuntime = Pick<IRuntime, "getPendingLocalState">;

class MockRuntime implements ISerializedStateManagerRuntime {
	public getPendingLocalState(_props?: IGetPendingLocalStateProps | undefined): unknown {
		return { pending: {} };
	}
}

const resolvedUrl: IResolvedUrl = {
	type: "fluid",
	id: "",
	url: "test",
	tokens: {},
	endpoints: {},
};

const errorFn = (error: Error, expected: string): boolean => {
	assert.notStrictEqual(error.message, undefined, "error is undefined");
	assert.strictEqual(error.message, expected, `Unexpected error: ${error.message}`);
	return true;
};

const getAttributesFromPendingState = (
	pendingState: IPendingContainerState,
): IDocumentAttributes => {
	if (pendingState.baseSnapshot === undefined) {
		throw new Error("base snapshot should be valid");
	}
	const attributesId = pendingState.baseSnapshot.trees[".protocol"].blobs.attributes;
	const attributes = pendingState.snapshotBlobs[attributesId];
	return JSON.parse(attributes) as IDocumentAttributes;
};

function generateSavedOp(seq: number): ISequencedDocumentMessage {
	return {
		clientId: "Some client ID",
		minimumSequenceNumber: 0,
		sequenceNumber: seq,
		type: MessageType.Operation,
	} as unknown as ISequencedDocumentMessage;
}

function enableOfflineSnapshotRefresh(logger: ITelemetryBaseLogger): ITelemetryBaseLogger {
	return mixinMonitoringContext(logger, {
		getRawConfig: (name) =>
			name === "Fluid.Container.enableOfflineSnapshotRefresh" ? true : undefined,
	}).logger;
}

describe("serializedStateManager", () => {
	let logger: MockLogger;

	beforeEach("setup", () => {
		logger = new MockLogger();
	});

	describe("before refreshing the snapshot", () => {
		it("can't get pending local state when offline load disabled", async () => {
			const storageAdapter = new MockStorageAdapter();
			const serializedStateManager = new SerializedStateManager(
				undefined,
				enableOfflineSnapshotRefresh(logger),
				storageAdapter,
				false,
				eventEmitter,
				() => false,
				() => false,
			);

			await assert.rejects(
				async () =>
					serializedStateManager.getPendingLocalState(
						{
							notifyImminentClosure: false,
						},
						"clientId",
						new MockRuntime(),
						resolvedUrl,
					),
				(error: Error) =>
					errorFn(error, "Can't get pending local state unless offline load is enabled"),
				"container can get local state with offline load disabled",
			);
		});

		it("can get pending local state after attach", async () => {
			const serializedStateManager = new SerializedStateManager(
				undefined,
				enableOfflineSnapshotRefresh(logger),
				failSometimeProxy<ISerializedStateManagerDocumentStorageService>({
					loadedGroupIdSnapshots: {},
				}),
				true,
				eventEmitter,
				() => false,
				() => false,
			);
			// equivalent to attach
			serializedStateManager.setInitialSnapshot({
				baseSnapshot: snapshot,
				snapshotBlobs: {
					attributesId: '{"minimumSequenceNumber" : 0, "sequenceNumber": 0}',
				},
			});
			await serializedStateManager.getPendingLocalState(
				{ notifyImminentClosure: false },
				"clientId",
				new MockRuntime(),
				resolvedUrl,
			);
		});

		it("can get pending local state from previous pending state", async () => {
			const pending: IPendingContainerState = {
				...pendingLocalState,
				baseSnapshot: { ...snapshot, id: "fromPending" },
			};
			const storageAdapter = new MockStorageAdapter();
			const serializedStateManager = new SerializedStateManager(
				pending,
				enableOfflineSnapshotRefresh(logger),
				storageAdapter,
				true,
				eventEmitter,
				() => false,
				() => false,
			);
			const { baseSnapshot, version } = await serializedStateManager.fetchSnapshot(undefined);
			assert(baseSnapshot);
			assert.strictEqual(version, undefined);
			const state = await serializedStateManager.getPendingLocalState(
				{ notifyImminentClosure: false },
				"clientId",
				new MockRuntime(),
				resolvedUrl,
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			assert.strictEqual(JSON.parse(state).baseSnapshot.id, "fromPending");
		});

		it("can fetch snapshot and get state from it", async () => {
			const storageAdapter = new MockStorageAdapter();
			const serializedStateManager = new SerializedStateManager(
				undefined,
				enableOfflineSnapshotRefresh(logger),
				storageAdapter,
				true,
				eventEmitter,
				() => false,
				() => false,
			);
			const { baseSnapshot, version } = await serializedStateManager.fetchSnapshot(undefined);
			assert(baseSnapshot);
			assert.strictEqual(version?.id, "fromStorage");
			assert.strictEqual(version.treeId, "fromStorage");
			const state = await serializedStateManager.getPendingLocalState(
				{ notifyImminentClosure: false },
				"clientId",
				new MockRuntime(),
				resolvedUrl,
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const parsed = JSON.parse(state);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			assert.strictEqual(parsed.baseSnapshot.id, "fromStorage");
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const attributes = getAttributesFromPendingState(parsed);
			assert.strictEqual(attributes.sequenceNumber, 0);
			assert.strictEqual(attributes.minimumSequenceNumber, 0);
		});

		it("get pending state again before getting latest snapshot", async () => {
			const pending: IPendingContainerState = {
				...pendingLocalState,
				baseSnapshot: { ...snapshot, id: "fromPending" },
			};
			const storageAdapter = new MockStorageAdapter();
			const getLatestSnapshotInfoP = new Deferred<void>();
			const serializedStateManager = new SerializedStateManager(
				pending,
				enableOfflineSnapshotRefresh(logger),
				storageAdapter,
				true,
				eventEmitter,
				() => false,
				() => false,
			);
			// eslint-disable-next-line no-void
			void serializedStateManager.refreshSnapshotP?.then(() =>
				getLatestSnapshotInfoP.resolve(),
			);
			let seq = 1;
			let lastProcessedOpSequenceNumber = 20;
			while (seq <= lastProcessedOpSequenceNumber) {
				serializedStateManager.addProcessedOp(generateSavedOp(seq++));
			}
			const snapshotSequenceNumber = 11;
			storageAdapter.uploadSummary(snapshotSequenceNumber);

			await serializedStateManager.fetchSnapshot(undefined);
			lastProcessedOpSequenceNumber = 25;
			while (seq <= lastProcessedOpSequenceNumber) {
				serializedStateManager.addProcessedOp(generateSavedOp(seq++));
			}
			// getting pending state without waiting for fetching new snapshot.
			assert.strictEqual(getLatestSnapshotInfoP.isCompleted, false);
			const state = await serializedStateManager.getPendingLocalState(
				{ notifyImminentClosure: false },
				"clientId",
				new MockRuntime(),
				resolvedUrl,
			);
			const parsed = JSON.parse(state) as IPendingContainerState;
			assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
			const attributes = getAttributesFromPendingState(parsed);
			assert.strictEqual(attributes.sequenceNumber, 0, "wrong snapshot sequence number");
			assert.strictEqual(parsed.savedOps[0].sequenceNumber, 1, "wrong first saved op");
			assert.strictEqual(
				parsed.savedOps[parsed.savedOps.length - 1].sequenceNumber,
				lastProcessedOpSequenceNumber,
				"wrong last saved op",
			);
		});

		it("pending state again before refreshing latest snapshot", async () => {
			const pending: IPendingContainerState = {
				...pendingLocalState,
				baseSnapshot: { ...snapshot, id: "fromPending" },
			};
			const storageAdapter = new MockStorageAdapter();
			const serializedStateManager = new SerializedStateManager(
				pending,
				enableOfflineSnapshotRefresh(logger),
				storageAdapter,
				true,
				eventEmitter,
				() => false,
				() => false,
			);
			let seq = 1;
			let lastProcessedOpSequenceNumber = 20;
			while (seq <= 20) {
				serializedStateManager.addProcessedOp(generateSavedOp(seq++));
			}

			const snapshotSequenceNumber = 30;
			storageAdapter.uploadSummary(snapshotSequenceNumber);

			await serializedStateManager.fetchSnapshot(undefined);
			// new snapshot fetched but not refreshed since processed ops are behind the snapshot
			await serializedStateManager.refreshSnapshotP;

			lastProcessedOpSequenceNumber = 29; // keep adding ops but not enough to refresh the snapshot
			while (seq <= lastProcessedOpSequenceNumber) {
				serializedStateManager.addProcessedOp(generateSavedOp(seq++));
			}

			const state = await serializedStateManager.getPendingLocalState(
				{ notifyImminentClosure: false },
				"clientId",
				new MockRuntime(),
				resolvedUrl,
			);
			const parsed = JSON.parse(state) as IPendingContainerState;
			assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
			const attributes = getAttributesFromPendingState(parsed);
			assert.strictEqual(attributes.sequenceNumber, 0, "wrong snapshot sequence number");
			assert.strictEqual(parsed.savedOps[0].sequenceNumber, 1, "wrong first saved op");
			assert.strictEqual(
				parsed.savedOps[parsed.savedOps.length - 1].sequenceNumber,
				lastProcessedOpSequenceNumber,
				"wrong last saved op",
			);
		});

		it("fail to get latest snapshot", async () => {
			const pending: IPendingContainerState = {
				...pendingLocalState,
				baseSnapshot: { ...snapshot, id: "fromPending" },
			};
			const storageAdapter = new MockStorageAdapter({
				id: "fromStorage",
				blobs: {},
				trees: {
					".protocol": {
						blobs: { attributes: "wrongId" },
						trees: {},
					},
					".app": {
						blobs: {},
						trees: {},
					},
				},
			});
			const serializedStateManager = new SerializedStateManager(
				pending,
				enableOfflineSnapshotRefresh(logger),
				storageAdapter,
				true,
				eventEmitter,
				() => false,
				() => false,
			);
			const lastProcessedOpSequenceNumber = 20;
			let seq = 1;
			while (seq <= lastProcessedOpSequenceNumber) {
				serializedStateManager.addProcessedOp(generateSavedOp(seq++));
			}

			const snapshotSequenceNumber = 11;
			storageAdapter.uploadSummary(snapshotSequenceNumber);

			await serializedStateManager.fetchSnapshot(undefined);
			await serializedStateManager.refreshSnapshotP;

			const state = await serializedStateManager.getPendingLocalState(
				{ notifyImminentClosure: false },
				"clientId",
				new MockRuntime(),
				resolvedUrl,
			);
			const parsed = JSON.parse(state) as IPendingContainerState;
			assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
		});
	});

	describe("refreshing the snapshot", () => {
		for (const isDirty of [true, false]) {
			it(`fetched snapshot is the same as pending snapshot, isDirty: ${isDirty}`, async () => {
				const pending: IPendingContainerState = {
					...pendingLocalState,
					baseSnapshot: { ...snapshot, id: "fromPending" },
				};
				const storageAdapter = new MockStorageAdapter();
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const serializedStateManager = new SerializedStateManager(
					pending,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
				);
				for (const savedOp of savedOps) {
					serializedStateManager.addProcessedOp(savedOp);
				}

				const { baseSnapshot, version } =
					await serializedStateManager.fetchSnapshot(undefined);
				const baseSnapshotTree: ISnapshotTree | undefined = getSnapshotTree(baseSnapshot);
				assert.strictEqual(baseSnapshotTree.id, "fromPending");
				assert.strictEqual(version, undefined);
				// It'll wait until getLatestSnapshotInfo finish. This ensures we attempted to refresh
				// serializedStateManager.snapshot
				await serializedStateManager.refreshSnapshotP;
				if (isDirty) {
					logger.assertMatchNone([
						{ eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing" },
					]);
					saved = true;
					eventEmitter.emit("saved");
				}
				logger.assertMatchAny([
					{
						eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing",
						snapshotSequenceNumber: 0,
						firstProcessedOpSequenceNumber: 1,
					},
				]);
				const state = await serializedStateManager.getPendingLocalState(
					{ notifyImminentClosure: false },
					"clientId",
					new MockRuntime(),
					resolvedUrl,
				);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const parsed = JSON.parse(state);
				// We keep using the pending snapshot since there were no summaries since then.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				const attributes = getAttributesFromPendingState(parsed);
				assert.strictEqual(attributes.sequenceNumber, 0);
				assert.strictEqual(attributes.minimumSequenceNumber, 0);
			});

			it(`snapshot is older than first processed op, isDirty: ${isDirty}`, async () => {
				const pending: IPendingContainerState = {
					...pendingLocalState,
					baseSnapshot: { ...snapshot, id: "fromPending" },
					savedOps: [generateSavedOp(13)],
				};
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const storageAdapter = new MockStorageAdapter();
				const serializedStateManager = new SerializedStateManager(
					pending,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
				);
				const firstProcessedOpSequenceNumber = 13; // greater than snapshotSequenceNumber + 1
				const lastProcessedOpSequenceNumber = 40;
				let seq = firstProcessedOpSequenceNumber;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}
				const snapshotSequenceNumber = 11; // uploading an snapshot too old to be the latest
				storageAdapter.uploadSummary(snapshotSequenceNumber);
				await serializedStateManager.fetchSnapshot(undefined);
				await serializedStateManager.refreshSnapshotP;
				if (isDirty) {
					logger.assertMatchNone([
						{ eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing" },
					]);
					saved = true;
					eventEmitter.emit("saved");
				}
				logger.assertMatchAny([
					{
						eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing",
						snapshotSequenceNumber,
						firstProcessedOpSequenceNumber,
						lastProcessedOpSequenceNumber,
						stashedSnapshotSequenceNumber: snapshotSequenceNumber,
					},
				]);
				const state = await serializedStateManager.getPendingLocalState(
					{ notifyImminentClosure: false },
					"clientId",
					new MockRuntime(),
					resolvedUrl,
				);
				const parsed = JSON.parse(state) as IPendingContainerState;
				assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
			});

			it(`refresh snapshot when snapshot sequence number is among processed ops, isDirty: ${isDirty}`, async () => {
				const pending: IPendingContainerState = {
					...pendingLocalState,
					baseSnapshot: { ...snapshot, id: "fromPending" },
				};
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const storageAdapter = new MockStorageAdapter();
				const serializedStateManager = new SerializedStateManager(
					pending,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
				);

				const lastProcessedOpSequenceNumber = 20;
				let seq = 1;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}

				const snapshotSequenceNumber = 11; // latest snapshot will be among processed ops
				storageAdapter.uploadSummary(snapshotSequenceNumber);

				await serializedStateManager.fetchSnapshot(undefined);
				// wait to get latest snapshot
				// this time the snapshot should have been refreshed
				await serializedStateManager.refreshSnapshotP;
				if (isDirty) {
					logger.assertMatchNone([
						{ eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing" },
						{ eventName: "serializedStateManager:SnapshotRefreshed" },
					]);
					saved = true;
					eventEmitter.emit("saved");
				}
				const state = await serializedStateManager.getPendingLocalState(
					{ notifyImminentClosure: false },
					"clientId",
					new MockRuntime(),
					resolvedUrl,
				);
				const parsed = JSON.parse(state) as IPendingContainerState;
				assert.strictEqual(parsed.baseSnapshot.id, "fromStorage", "snapshot was not updated");
				const attributes = getAttributesFromPendingState(parsed);
				assert.strictEqual(
					attributes.sequenceNumber,
					snapshotSequenceNumber,
					"wrong snapshot sequence number",
				);
				assert.strictEqual(
					parsed.savedOps[0].sequenceNumber,
					snapshotSequenceNumber + 1,
					"wrong first saved op",
				);
				assert.strictEqual(
					parsed.savedOps[parsed.savedOps.length - 1].sequenceNumber,
					lastProcessedOpSequenceNumber,
					"wrong last saved op",
				);
			});

			it(`refresh snapshot when there are no processed ops, isDirty: ${isDirty}`, async () => {
				const pending: IPendingContainerState = {
					...pendingLocalState,
					baseSnapshot: { ...snapshot, id: "fromPending" },
					savedOps: [],
				};
				const storageAdapter = new MockStorageAdapter();
				const serializedStateManager = new SerializedStateManager(
					pending,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					() => isDirty,
					() => false,
				);
				const snapshotSequenceNumber = 11;
				storageAdapter.uploadSummary(snapshotSequenceNumber);

				await serializedStateManager.fetchSnapshot(undefined);
				await serializedStateManager.refreshSnapshotP;
				const state = await serializedStateManager.getPendingLocalState(
					{ notifyImminentClosure: false },
					"clientId",
					new MockRuntime(),
					resolvedUrl,
				);
				const parsed = JSON.parse(state) as IPendingContainerState;
				assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
				assert.strictEqual(parsed.savedOps.length, 0, "should not be savedOps");
			});

			it(`refresh snapshot when snapshot sequence number is above processed ops, isDirty: ${isDirty}`, async () => {
				const pending: IPendingContainerState = {
					...pendingLocalState,
					baseSnapshot: { ...snapshot, id: "fromPending" },
				};
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const storageAdapter = new MockStorageAdapter();
				const serializedStateManager = new SerializedStateManager(
					pending,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
				);
				let seq = 1;
				let lastProcessedOpSequenceNumber = 20;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}

				const snapshotSequenceNumber = 30;
				storageAdapter.uploadSummary(snapshotSequenceNumber);

				await serializedStateManager.fetchSnapshot(undefined);
				// latest snapshot fetched but we're still behind the snapshot.
				// next addProcessedOp calls will be responsible for refreshing
				await serializedStateManager.refreshSnapshotP;

				lastProcessedOpSequenceNumber = 40;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}
				if (isDirty) {
					logger.assertMatchNone([
						{ eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing" },
						{ eventName: "serializedStateManager:SnapshotRefreshed" },
					]);
					saved = true;
					eventEmitter.emit("saved");
				}

				const state = await serializedStateManager.getPendingLocalState(
					{ notifyImminentClosure: false },
					"clientId",
					new MockRuntime(),
					resolvedUrl,
				);
				const parsed = JSON.parse(state) as IPendingContainerState;
				assert.strictEqual(parsed.baseSnapshot.id, "fromStorage");
				const attributes = getAttributesFromPendingState(parsed);
				assert.strictEqual(
					attributes.sequenceNumber,
					snapshotSequenceNumber,
					"wrong snapshot sequence number",
				);
				assert.strictEqual(
					parsed.savedOps[0].sequenceNumber,
					snapshotSequenceNumber + 1,
					"wrong first saved op",
				);
				assert.strictEqual(
					parsed.savedOps[parsed.savedOps.length - 1].sequenceNumber,
					lastProcessedOpSequenceNumber,
					"wrong last saved op",
				);
			});

			it(`does not refresh snapshot when we haven't processed all saved ops, isDirty: ${isDirty}`, async () => {
				const lastProcessedOpSequenceNumber = 10;
				const pending: IPendingContainerState = {
					...pendingLocalState,
					baseSnapshot: { ...snapshot, id: "fromPending" },
					savedOps: [generateSavedOp(lastProcessedOpSequenceNumber)],
				};
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const storageAdapter = new MockStorageAdapter();
				const serializedStateManager = new SerializedStateManager(
					pending,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
				);
				let seq = 1;
				while (seq <= 5) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}

				const snapshotSequenceNumber = 7;
				storageAdapter.uploadSummary(snapshotSequenceNumber);

				await serializedStateManager.fetchSnapshot(undefined);
				// latest snapshot fetched but we're still behind the snapshot.
				await serializedStateManager.refreshSnapshotP;
				while (seq < lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}
				// we passed the snapshot but haven't processed the last saved op
				// so update is not expected

				if (isDirty) {
					saved = true;
					eventEmitter.emit("saved");
				}

				const state = await serializedStateManager.getPendingLocalState(
					{ notifyImminentClosure: false },
					"clientId",
					new MockRuntime(),
					resolvedUrl,
				);
				const parsed = JSON.parse(state) as IPendingContainerState;
				assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
			});
		}
	});

	describe("session expiry time", () => {
		for (const isDirty of [true, false]) {
			it(`session expiry time when snapshot is not refreshed, isDirty: ${isDirty}`, async () => {
				const pending: IPendingContainerState = {
					...pendingLocalState,
					baseSnapshot: { ...snapshot, id: "fromPending" },
				};
				const storageAdapter = new MockStorageAdapter();
				const serializedStateManager = new SerializedStateManager(
					pending,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					() => isDirty,
					() => false,
				);

				await serializedStateManager.fetchSnapshot(undefined);
				await serializedStateManager.refreshSnapshotP;

				const mockRuntime: ISerializedStateManagerRuntime = {
					getPendingLocalState: (props) => {
						return props;
					},
				};
				const state = await serializedStateManager.getPendingLocalState(
					{ notifyImminentClosure: false },
					"clientId",
					mockRuntime,
					resolvedUrl,
				);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const parsed = JSON.parse(state);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				assert.strictEqual(parsed.pendingRuntimeState.sessionExpiryTimerStarted, undefined);
			});

			it(`session expiry time when snapshot is refreshed but no saved event. isDirty: ${isDirty}`, async () => {
				const pending: IPendingContainerState = {
					...pendingLocalState,
					baseSnapshot: { ...snapshot, id: "fromPending" },
				};
				const storageAdapter = new MockStorageAdapter();
				const serializedStateManager = new SerializedStateManager(
					pending,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					() => isDirty,
					() => false,
				);
				const lastProcessedOpSequenceNumber = 10;
				let seq = 1;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}
				const snapshotSequenceNumber = 5;
				storageAdapter.uploadSummary(snapshotSequenceNumber);

				await serializedStateManager.fetchSnapshot(undefined);
				await serializedStateManager.refreshSnapshotP;

				const mockRuntime: ISerializedStateManagerRuntime = {
					getPendingLocalState: (props) => {
						return props;
					},
				};
				const state = await serializedStateManager.getPendingLocalState(
					{ notifyImminentClosure: false },
					"clientId",
					mockRuntime,
					resolvedUrl,
				);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const parsed = JSON.parse(state);
				// Since there is no saved event, it should only update the expiry timer
				// when we're not dirty at fetching time.
				if (isDirty) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					assert.strictEqual(parsed.pendingRuntimeState.sessionExpiryTimerStarted, undefined);
				} else {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					assert.ok(parsed.pendingRuntimeState.sessionExpiryTimerStarted);
				}
			});

			it(`session expiry time when snapshot is refreshed and there is a saved event. isDirty: ${isDirty}`, async () => {
				const pending: IPendingContainerState = {
					...pendingLocalState,
					baseSnapshot: { ...snapshot, id: "fromPending" },
				};
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const storageAdapter = new MockStorageAdapter();
				const serializedStateManager = new SerializedStateManager(
					pending,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
				);
				const lastProcessedOpSequenceNumber = 10;
				let seq = 1;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}
				const snapshotSequenceNumber = 5;
				storageAdapter.uploadSummary(snapshotSequenceNumber);

				await serializedStateManager.fetchSnapshot(undefined);
				await serializedStateManager.refreshSnapshotP;
				if (isDirty) {
					saved = true;
					eventEmitter.emit("saved");
				}
				const mockRuntime: ISerializedStateManagerRuntime = {
					getPendingLocalState: (props) => {
						return props;
					},
				};
				const state = await serializedStateManager.getPendingLocalState(
					{ notifyImminentClosure: false },
					"clientId",
					mockRuntime,
					resolvedUrl,
				);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const parsed = JSON.parse(state);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				assert.ok(parsed.pendingRuntimeState.sessionExpiryTimerStarted);
			});
		}
	});

	describe("periodic snapshot refresh", () => {
		let clock: SinonFakeTimers;
		const snapshotRefreshTimeoutMs = 10;

		before(() => {
			clock = useFakeTimers();
		});

		afterEach(() => {
			clock.reset();
		});

		after(() => {
			clock.restore();
		});

		async function yieldEventLoop(): Promise<void> {
			const yieldP = new Promise<void>((resolve) => {
				setTimeout(resolve);
			});
			clock.tick(1);
			await yieldP;
		}

		const pendingStateValidation = async (
			serializedStateManager: SerializedStateManager,
			snapshotSequenceNumber: number,
			lastProcessedOpSequenceNumber: number,
		): Promise<void> => {
			// pending state validation
			const state = await serializedStateManager.getPendingLocalState(
				{ notifyImminentClosure: false },
				"clientId",
				new MockRuntime(),
				resolvedUrl,
			);
			const parsed = JSON.parse(state) as IPendingContainerState;
			assert.strictEqual(parsed.baseSnapshot.id, "fromStorage", "snapshot was not updated");
			const attributes = getAttributesFromPendingState(parsed);
			assert.strictEqual(
				attributes.sequenceNumber,
				snapshotSequenceNumber,
				"wrong snapshot sequence number",
			);
			assert.strictEqual(
				parsed.savedOps[0].sequenceNumber,
				snapshotSequenceNumber + 1,
				"wrong first saved op",
			);
			assert.strictEqual(
				parsed.savedOps[parsed.savedOps.length - 1].sequenceNumber,
				lastProcessedOpSequenceNumber,
				"wrong last saved op",
			);
		};

		for (const isDirty of [true, false]) {
			it(`snapshot refresh at timeout in attach flow, isDirty:${isDirty}`, async () => {
				const storageAdapter = new MockStorageAdapter();
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const serializedStateManager = new SerializedStateManager(
					undefined,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
					snapshotRefreshTimeoutMs,
				);
				// equivalent to attach
				serializedStateManager.setInitialSnapshot({
					baseSnapshot: snapshot,
					snapshotBlobs: {
						attributesId: '{"minimumSequenceNumber" : 0, "sequenceNumber": 0}',
					},
				});

				const lastProcessedOpSequenceNumber = 20;
				let seq = 1;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}
				let snapshotSequenceNumber = 11; // latest snapshot will be among processed ops
				storageAdapter.uploadSummary(snapshotSequenceNumber);
				// snapshot refresh promise is undefined before timeout
				const snapshotRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(snapshotRefreshP, undefined);
				clock.tick(snapshotRefreshTimeoutMs);
				// now it's a promise
				const initialRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(initialRefreshP instanceof Promise, true);

				if (isDirty) {
					logger.assertMatchNone([
						{ eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing" },
						{ eventName: "serializedStateManager:SnapshotRefreshed" },
					]);
					saved = true;
					eventEmitter.emit("saved");
				}
				// promise returns the snap seq num
				assert.strictEqual(
					await initialRefreshP,
					snapshotSequenceNumber,
					"refresh didn't happen",
				);
				await yieldEventLoop();
				// snapshot refresh promise is reset to undefined
				const secondRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(secondRefreshP, undefined);
				snapshotSequenceNumber = 18; // latest snapshot will be among processed ops
				storageAdapter.uploadSummary(snapshotSequenceNumber);
				clock.tick(snapshotRefreshTimeoutMs);
				const thirdRefresh = await serializedStateManager.refreshSnapshotP;
				assert.strictEqual(thirdRefresh, snapshotSequenceNumber);

				// pending state validation
				await pendingStateValidation(
					serializedStateManager,
					snapshotSequenceNumber,
					lastProcessedOpSequenceNumber,
				);
			});

			it(`attach flow, saved event before fetching the snapshot isDirty:${isDirty}`, async () => {
				const storageAdapter = new MockStorageAdapter();
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const serializedStateManager = new SerializedStateManager(
					undefined,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
					snapshotRefreshTimeoutMs,
				);
				// equivalent to attach
				serializedStateManager.setInitialSnapshot({
					baseSnapshot: snapshot,
					snapshotBlobs: {
						attributesId: '{"minimumSequenceNumber" : 0, "sequenceNumber": 0}',
					},
				});

				const lastProcessedOpSequenceNumber = 20;
				let seq = 1;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}
				let snapshotSequenceNumber = 11; // latest snapshot will be among processed ops
				storageAdapter.uploadSummary(snapshotSequenceNumber);

				if (isDirty) {
					logger.assertMatchNone([
						{ eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing" },
						{ eventName: "serializedStateManager:SnapshotRefreshed" },
					]);
					saved = true;
					eventEmitter.emit("saved");
				}

				const snapshotRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(snapshotRefreshP, undefined);
				clock.tick(snapshotRefreshTimeoutMs);
				// now it's a promise
				const initialRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(initialRefreshP instanceof Promise, true);
				// promise returns the snap seq num
				assert.strictEqual(
					await initialRefreshP,
					snapshotSequenceNumber,
					"refresh didn't happen",
				);
				await yieldEventLoop();
				// snapshot refresh promise is reset to undefined
				const secondRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(secondRefreshP, undefined);
				snapshotSequenceNumber = 18; // latest snapshot will be among processed ops
				storageAdapter.uploadSummary(snapshotSequenceNumber);
				clock.tick(snapshotRefreshTimeoutMs);
				const thirdRefresh = await serializedStateManager.refreshSnapshotP;
				assert.strictEqual(thirdRefresh, snapshotSequenceNumber);

				// pending state validation
				await pendingStateValidation(
					serializedStateManager,
					snapshotSequenceNumber,
					lastProcessedOpSequenceNumber,
				);
			});

			it(`snapshot refresh at timeout in load flow. isDirty: ${isDirty}`, async () => {
				const storageAdapter = new MockStorageAdapter();
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const serializedStateManager = new SerializedStateManager(
					undefined,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
					snapshotRefreshTimeoutMs,
				);

				await serializedStateManager.fetchSnapshot(undefined);
				const lastProcessedOpSequenceNumber = 20;
				let seq = 1;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}
				let snapshotSequenceNumber = 11; // latest snapshot will be among processed ops
				storageAdapter.uploadSummary(snapshotSequenceNumber);
				// snapshot refresh promise is undefined before timeout
				const snapshotRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(snapshotRefreshP, undefined);
				clock.tick(snapshotRefreshTimeoutMs);
				// now it's a promise
				const initialRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(initialRefreshP instanceof Promise, true);

				if (isDirty) {
					logger.assertMatchNone([
						{ eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing" },
						{ eventName: "serializedStateManager:SnapshotRefreshed" },
					]);
					saved = true;
					eventEmitter.emit("saved");
				}
				// promise returns the snap seq num
				assert.strictEqual(
					await initialRefreshP,
					snapshotSequenceNumber,
					"refresh didn't happen",
				);
				await yieldEventLoop();
				// snapshot refresh promise is reset to undefined
				const secondRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(secondRefreshP, undefined);
				snapshotSequenceNumber = 18;
				storageAdapter.uploadSummary(snapshotSequenceNumber);
				clock.tick(snapshotRefreshTimeoutMs);
				// after a js turn and another timeout, the snapshot is refreshed
				const thirdRefresh = await serializedStateManager.refreshSnapshotP;
				assert.strictEqual(thirdRefresh, snapshotSequenceNumber);

				// pending state validation
				await pendingStateValidation(
					serializedStateManager,
					snapshotSequenceNumber,
					lastProcessedOpSequenceNumber,
				);
			});

			it(`load flow. saved event before fetching the snapshot isDirty: ${isDirty}`, async () => {
				const storageAdapter = new MockStorageAdapter();
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const serializedStateManager = new SerializedStateManager(
					undefined,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
					snapshotRefreshTimeoutMs,
				);

				await serializedStateManager.fetchSnapshot(undefined);
				const lastProcessedOpSequenceNumber = 20;
				let seq = 1;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}
				let snapshotSequenceNumber = 11; // latest snapshot will be among processed ops
				storageAdapter.uploadSummary(snapshotSequenceNumber);

				if (isDirty) {
					logger.assertMatchNone([
						{ eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing" },
						{ eventName: "serializedStateManager:SnapshotRefreshed" },
					]);
					saved = true;
					eventEmitter.emit("saved");
				}

				// snapshot refresh promise is undefined before timeout
				const snapshotRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(snapshotRefreshP, undefined);
				clock.tick(snapshotRefreshTimeoutMs);
				// now it's a promise
				const initialRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(initialRefreshP instanceof Promise, true);

				// promise returns the snap seq num
				assert.strictEqual(
					await initialRefreshP,
					snapshotSequenceNumber,
					"refresh didn't happen",
				);
				await yieldEventLoop();
				// snapshot refresh promise is reset to undefined
				const secondRefreshP = serializedStateManager.refreshSnapshotP;
				assert.strictEqual(secondRefreshP, undefined);
				snapshotSequenceNumber = 18;
				storageAdapter.uploadSummary(snapshotSequenceNumber);
				clock.tick(snapshotRefreshTimeoutMs);
				// after a js turn and another timeout, the snapshot is refreshed
				const thirdRefresh = await serializedStateManager.refreshSnapshotP;
				assert.strictEqual(thirdRefresh, snapshotSequenceNumber);

				// pending state validation
				await pendingStateValidation(
					serializedStateManager,
					snapshotSequenceNumber,
					lastProcessedOpSequenceNumber,
				);
			});

			it(`load flow, snapshot is older than first processed op, isDirty: ${isDirty}`, async () => {
				const pending: IPendingContainerState = {
					...pendingLocalState,
					baseSnapshot: { ...snapshot, id: "fromPending" },
				};
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const storageAdapter = new MockStorageAdapter();
				const serializedStateManager = new SerializedStateManager(
					pending,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
					snapshotRefreshTimeoutMs,
				);
				const firstProcessedOpSequenceNumber = 13; // greater than snapshotSequenceNumber + 1 (11)
				const lastProcessedOpSequenceNumber = 40;
				let seq = firstProcessedOpSequenceNumber;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}
				let snapshotSequenceNumber = 11; // uploading a snapshot too old to be the latest
				storageAdapter.uploadSummary(snapshotSequenceNumber);
				await serializedStateManager.fetchSnapshot(undefined);
				await serializedStateManager.refreshSnapshotP;
				if (isDirty) {
					logger.assertMatchNone([
						{ eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing" },
					]);
					saved = true;
					eventEmitter.emit("saved");
				}
				logger.assertMatchAny([
					{
						eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing",
						snapshotSequenceNumber,
						firstProcessedOpSequenceNumber,
						lastProcessedOpSequenceNumber,
						stashedSnapshotSequenceNumber: snapshotSequenceNumber,
					},
				]);

				// update the snapshot after timeout
				await yieldEventLoop();
				snapshotSequenceNumber = 16; // uploading a snapshot too old to be the latest
				storageAdapter.uploadSummary(snapshotSequenceNumber);
				clock.tick(snapshotRefreshTimeoutMs);
				await serializedStateManager.refreshSnapshotP;
				logger.assertMatchAny([
					{
						eventName: "serializedStateManager:SnapshotRefreshed",
						snapshotSequenceNumber,
						firstProcessedOpSequenceNumber,
						newFirstProcessedOpSequenceNumber: snapshotSequenceNumber + 1,
					},
				]);
				// pending state validation
				await pendingStateValidation(
					serializedStateManager,
					snapshotSequenceNumber,
					lastProcessedOpSequenceNumber,
				);
			});

			it(`load flow, snapshot is newer than last processed op, isDirty: ${isDirty}`, async () => {
				const pending: IPendingContainerState = {
					...pendingLocalState,
					baseSnapshot: { ...snapshot, id: "fromPending" },
				};
				let saved = false;
				const isDirtyF = (): boolean => (saved ? false : isDirty);
				const storageAdapter = new MockStorageAdapter();
				const serializedStateManager = new SerializedStateManager(
					pending,
					enableOfflineSnapshotRefresh(logger),
					storageAdapter,
					true,
					eventEmitter,
					isDirtyF,
					() => false,
					snapshotRefreshTimeoutMs,
				);
				let seq = 1;
				let lastProcessedOpSequenceNumber = 20;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}

				let snapshotSequenceNumber = 30;
				storageAdapter.uploadSummary(snapshotSequenceNumber);

				await serializedStateManager.fetchSnapshot(undefined);
				// latest snapshot fetched but we're still behind the snapshot.
				// next addProcessedOp calls will be responsible for refreshing
				await serializedStateManager.refreshSnapshotP;

				lastProcessedOpSequenceNumber = 40;
				while (seq <= lastProcessedOpSequenceNumber) {
					serializedStateManager.addProcessedOp(generateSavedOp(seq++));
				}
				if (isDirty) {
					logger.assertMatchNone([
						{ eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing" },
						{ eventName: "serializedStateManager:SnapshotRefreshed" },
					]);
					saved = true;
					eventEmitter.emit("saved");
				}
				// update the snapshot after timeout
				await yieldEventLoop();
				snapshotSequenceNumber = 35;
				storageAdapter.uploadSummary(snapshotSequenceNumber);
				clock.tick(snapshotRefreshTimeoutMs);
				await serializedStateManager.refreshSnapshotP;
				logger.assertMatchAny([
					{
						eventName: "serializedStateManager:SnapshotRefreshed",
						snapshotSequenceNumber,
						newFirstProcessedOpSequenceNumber: snapshotSequenceNumber + 1,
					},
				]);
				// pending state validation
				await pendingStateValidation(
					serializedStateManager,
					snapshotSequenceNumber,
					lastProcessedOpSequenceNumber,
				);
			});
		}
	});
});
