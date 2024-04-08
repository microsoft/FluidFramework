/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import {
	IGetPendingLocalStateProps,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import {
	FetchSource,
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
	ISnapshotFetchOptions,
} from "@fluidframework/driver-definitions/internal";
import {
	IDocumentAttributes,
	ISequencedDocumentMessage,
	ISnapshotTree,
	IVersion,
	MessageType,
} from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { type IPendingContainerState, SerializedStateManager } from "../serializedStateManager.js";
import { failProxy } from "./failProxy.js";

type ISerializedStateManagerDocumentStorageService = Pick<
	IDocumentStorageService,
	"getSnapshot" | "getSnapshotTree" | "getVersions" | "readBlob"
>;

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

const pendingLocalState: IPendingContainerState = {
	attached: true,
	baseSnapshot: snapshot,
	snapshotBlobs: { attributesId: '{"minimumSequenceNumber" : 0, "sequenceNumber": 0}' },
	pendingRuntimeState: {},
	savedOps: [],
	url: "fluid",
};

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

	public uploadSummary(sequenceNumber: number) {
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

describe("serializedStateManager", () => {
	let logger: MockLogger;
	function generateSavedOp(seq: number): ISequencedDocumentMessage {
		return {
			clientId: "Some client ID",
			minimumSequenceNumber: 0,
			sequenceNumber: seq,
			type: MessageType.Operation,
		} as any as ISequencedDocumentMessage;
	}

	beforeEach("setup", () => {
		logger = new MockLogger();
	});

	it("can't get pending local state when offline load disabled", async () => {
		const storageAdapter = new MockStorageAdapter();
		const serializedStateManager = new SerializedStateManager(
			undefined,
			logger.toTelemetryLogger(),
			storageAdapter,
			false,
		);

		await assert.rejects(
			async () =>
				serializedStateManager.getPendingLocalStateCore(
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
			logger.toTelemetryLogger(),
			failProxy(), // no calls to storage expected
			true,
		);
		// equivalent to attach
		serializedStateManager.setInitialSnapshot({
			baseSnapshot: snapshot,
			snapshotBlobs: { attributesId: '{"minimumSequenceNumber" : 0, "sequenceNumber": 0}' },
		});
		await serializedStateManager.getPendingLocalStateCore(
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
			logger.toTelemetryLogger(),
			storageAdapter,
			true,
		);
		const { baseSnapshot, version } = await serializedStateManager.fetchSnapshot(
			undefined,
			false,
		);
		assert(baseSnapshot);
		assert.strictEqual(version, undefined);
		const state = await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
		assert.strictEqual(JSON.parse(state).baseSnapshot.id, "fromPending");
	});

	it("can fetch snapshot and get state from it", async () => {
		const storageAdapter = new MockStorageAdapter();
		const serializedStateManager = new SerializedStateManager(
			undefined,
			logger.toTelemetryLogger(),
			storageAdapter,
			true,
		);
		const { baseSnapshot, version } = await serializedStateManager.fetchSnapshot(
			undefined,
			false,
		);
		assert(baseSnapshot);
		assert.strictEqual(version?.id, "fromStorage");
		assert.strictEqual(version.treeId, "fromStorage");
		const state = await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
		const parsed = JSON.parse(state);
		assert.strictEqual(parsed.baseSnapshot.id, "fromStorage");
		const attributes = getAttributesFromPendingState(parsed);
		assert.strictEqual(attributes.sequenceNumber, 0);
		assert.strictEqual(attributes.minimumSequenceNumber, 0);
	});

	it("fetched snapshot is the same as pending snapshot", async () => {
		const pending: IPendingContainerState = {
			...pendingLocalState,
			baseSnapshot: { ...snapshot, id: "fromPending" },
		};
		const storageAdapter = new MockStorageAdapter();
		const getLatestSnapshotInfoP = new Deferred<void>();
		// callback to help us identify when the background fetch finished.
		const newSnapshotFetched = () => {
			getLatestSnapshotInfoP.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger.toTelemetryLogger(),
			storageAdapter,
			true,
			newSnapshotFetched,
		);
		let seq = 1;
		while (seq < 10) {
			serializedStateManager.addProcessedOp(generateSavedOp(seq++));
		}
		const { baseSnapshot, version } = await serializedStateManager.fetchSnapshot(
			undefined,
			false,
		);
		assert.strictEqual(baseSnapshot.id, "fromPending");
		assert.strictEqual(version, undefined);
		// It'll wait until getLatestSnapshotInfo finish. This ensures we attempted to refresh
		// serializedStateManager.snapshot
		await getLatestSnapshotInfoP.promise;
		logger.assertMatchAny([
			{
				eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing",
				snapshotSequenceNumber: 0,
				firstProcessedOpSequenceNumber: 1,
			},
		]);
		const state = await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
		const parsed = JSON.parse(state);
		// We keep using the pending snapshot since there were no summaries since then.
		assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
		const attributes = getAttributesFromPendingState(parsed);
		assert.strictEqual(attributes.sequenceNumber, 0);
		assert.strictEqual(attributes.minimumSequenceNumber, 0);
	});

	it("snapshot is older than first processed op", async () => {
		const pending: IPendingContainerState = {
			...pendingLocalState,
			baseSnapshot: { ...snapshot, id: "fromPending" },
		};
		const storageAdapter = new MockStorageAdapter();
		const getLatestSnapshotInfoP = new Deferred<void>();
		const newSnapshotFetched = () => {
			getLatestSnapshotInfoP.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger.toTelemetryLogger(),
			storageAdapter,
			true,
			newSnapshotFetched,
		);

		const firstProcessedOpSequenceNumber = 13; // greater than snapshotSequenceNumber + 1
		const lastProcessedOpSequenceNumber = 40;
		let seq = firstProcessedOpSequenceNumber;
		while (seq <= lastProcessedOpSequenceNumber) {
			serializedStateManager.addProcessedOp(generateSavedOp(seq++));
		}
		const snapshotSequenceNumber = 11; // uploading an snapshot too old to be the latest
		storageAdapter.uploadSummary(snapshotSequenceNumber);
		await serializedStateManager.fetchSnapshot(undefined, false);
		await getLatestSnapshotInfoP.promise;
		logger.assertMatchAny([
			{
				eventName: "serializedStateManager:OldSnapshotFetchWhileRefreshing",
				snapshotSequenceNumber,
				firstProcessedOpSequenceNumber,
				lastProcessedOpSequenceNumber,
				stashedSnapshotSequenceNumber: snapshotSequenceNumber,
			},
		]);
		const state = await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
		const parsed = JSON.parse(state) as IPendingContainerState;
		assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
	});

	it("refresh snapshot when snapshot sequence number is among processed ops", async () => {
		const pending: IPendingContainerState = {
			...pendingLocalState,
			baseSnapshot: { ...snapshot, id: "fromPending" },
		};
		const storageAdapter = new MockStorageAdapter();
		const getLatestSnapshotInfoP = new Deferred<void>();
		const newSnapshotFetched = () => {
			getLatestSnapshotInfoP.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger.toTelemetryLogger(),
			storageAdapter,
			true,
			newSnapshotFetched,
		);

		const lastProcessedOpSequenceNumber = 20;
		let seq = 1;
		while (seq <= lastProcessedOpSequenceNumber) {
			serializedStateManager.addProcessedOp(generateSavedOp(seq++));
		}

		const snapshotSequenceNumber = 11; // latest snapshot will be among processed ops
		storageAdapter.uploadSummary(snapshotSequenceNumber);

		await serializedStateManager.fetchSnapshot(undefined, false);
		// wait to get latest snapshot
		// this time the snapshot should have been refreshed
		await getLatestSnapshotInfoP.promise;
		const state = await serializedStateManager.getPendingLocalStateCore(
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

	it("refresh snapshot when there are no processed ops", async () => {
		const pending: IPendingContainerState = {
			...pendingLocalState,
			baseSnapshot: { ...snapshot, id: "fromPending" },
		};
		const storageAdapter = new MockStorageAdapter();
		const getLatestSnapshotInfoP = new Deferred<void>();
		const newSnapshotFetched = () => {
			getLatestSnapshotInfoP.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger.toTelemetryLogger(),
			storageAdapter,
			true,
			newSnapshotFetched,
		);
		const snapshotSequenceNumber = 11;
		storageAdapter.uploadSummary(snapshotSequenceNumber);

		await serializedStateManager.fetchSnapshot(undefined, false);
		await getLatestSnapshotInfoP.promise;
		const state = await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
		const parsed = JSON.parse(state) as IPendingContainerState;
		assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
		assert.strictEqual(parsed.savedOps.length, 0, "should not be savedOps");
	});

	it("refresh snapshot when snapshot sequence number is above processed ops", async () => {
		const pending: IPendingContainerState = {
			...pendingLocalState,
			baseSnapshot: { ...snapshot, id: "fromPending" },
		};
		const storageAdapter = new MockStorageAdapter();
		const getLatestSnapshotInfoP = new Deferred<void>();
		const newSnapshotFetched = () => {
			getLatestSnapshotInfoP.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger.toTelemetryLogger(),
			storageAdapter,
			true,
			newSnapshotFetched,
		);
		let seq = 1;
		let lastProcessedOpSequenceNumber = 20;
		while (seq <= lastProcessedOpSequenceNumber) {
			serializedStateManager.addProcessedOp(generateSavedOp(seq++));
		}

		const snapshotSequenceNumber = 30;
		storageAdapter.uploadSummary(snapshotSequenceNumber);

		await serializedStateManager.fetchSnapshot(undefined, false);
		// latest snapshot fetched but we're still behind the snapshot.
		// next addProcessedOp calls will be responsible for refreshing
		await getLatestSnapshotInfoP.promise;

		lastProcessedOpSequenceNumber = 40;
		while (seq <= lastProcessedOpSequenceNumber) {
			serializedStateManager.addProcessedOp(generateSavedOp(seq++));
		}

		const state = await serializedStateManager.getPendingLocalStateCore(
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

	it("get pending state again before getting latest snapshot", async () => {
		const pending: IPendingContainerState = {
			...pendingLocalState,
			baseSnapshot: { ...snapshot, id: "fromPending" },
		};
		const storageAdapter = new MockStorageAdapter();
		const getLatestSnapshotInfoP = new Deferred<void>();
		const newSnapshotFetched = () => {
			getLatestSnapshotInfoP.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger.toTelemetryLogger(),
			storageAdapter,
			true,
			newSnapshotFetched,
		);
		let seq = 1;
		let lastProcessedOpSequenceNumber = 20;
		while (seq <= lastProcessedOpSequenceNumber) {
			serializedStateManager.addProcessedOp(generateSavedOp(seq++));
		}
		const snapshotSequenceNumber = 11;
		storageAdapter.uploadSummary(snapshotSequenceNumber);

		await serializedStateManager.fetchSnapshot(undefined, false);
		lastProcessedOpSequenceNumber = 25;
		while (seq <= lastProcessedOpSequenceNumber) {
			serializedStateManager.addProcessedOp(generateSavedOp(seq++));
		}
		// getting peding state without waiting for fetching new snapshot.
		assert.strictEqual(getLatestSnapshotInfoP.isCompleted, false);
		const state = await serializedStateManager.getPendingLocalStateCore(
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

	it("get pending state again before refreshing latest snapshot", async () => {
		const pending: IPendingContainerState = {
			...pendingLocalState,
			baseSnapshot: { ...snapshot, id: "fromPending" },
		};
		const storageAdapter = new MockStorageAdapter();
		const getLatestSnapshotInfoP = new Deferred<void>();
		const newSnapshotFetched = () => {
			getLatestSnapshotInfoP.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger.toTelemetryLogger(),
			storageAdapter,
			true,
			newSnapshotFetched,
		);
		let seq = 1;
		let lastProcessedOpSequenceNumber = 20;
		while (seq <= 20) {
			serializedStateManager.addProcessedOp(generateSavedOp(seq++));
		}

		const snapshotSequenceNumber = 30;
		storageAdapter.uploadSummary(snapshotSequenceNumber);

		await serializedStateManager.fetchSnapshot(undefined, false);
		// new snapshot fetched but not refreshed since processed ops are behind the snapshot
		await getLatestSnapshotInfoP.promise;

		lastProcessedOpSequenceNumber = 29; // keep adding ops but not enough to refresh the snapshot
		while (seq <= lastProcessedOpSequenceNumber) {
			serializedStateManager.addProcessedOp(generateSavedOp(seq++));
		}

		const state = await serializedStateManager.getPendingLocalStateCore(
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
		const getLatestSnapshotInfoP = new Deferred<void>();
		const newSnapshotFetched = () => {
			getLatestSnapshotInfoP.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger.toTelemetryLogger(),
			storageAdapter,
			true,
			newSnapshotFetched,
		);
		const lastProcessedOpSequenceNumber = 20;
		let seq = 1;
		while (seq <= lastProcessedOpSequenceNumber) {
			serializedStateManager.addProcessedOp(generateSavedOp(seq++));
		}

		const snapshotSequenceNumber = 11;
		storageAdapter.uploadSummary(snapshotSequenceNumber);

		await serializedStateManager.fetchSnapshot(undefined, false);
		await getLatestSnapshotInfoP.promise;

		const state = await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
		const parsed = JSON.parse(state) as IPendingContainerState;
		assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
	});
});
