/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { IGetPendingLocalStateProps, IRuntime } from "@fluidframework/container-definitions";
import { Deferred } from "@fluidframework/core-utils";
import {
	FetchSource,
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
	ISnapshotFetchOptions,
} from "@fluidframework/driver-definitions";
import {
	IDocumentAttributes,
	ISequencedDocumentMessage,
	ISnapshotTree,
	IVersion,
	MessageType,
} from "@fluidframework/protocol-definitions";
import { ITelemetryLoggerExt, createChildLogger } from "@fluidframework/telemetry-utils";
import { type IPendingContainerState, SerializedStateManager } from "../serializedStateManager.js";

type ISerializedStateManagerDocumentStorageService = Pick<
	IDocumentStorageService,
	"getSnapshot" | "getSnapshotTree" | "getVersions" | "readBlob"
>;

const failProxy = <T extends object>() => {
	const proxy = new Proxy<T>({} as any as T, {
		get: (_, p) => {
			if (p === "then") {
				return undefined;
			}
			throw Error(`${p.toString()} not implemented`);
		},
	});
	return proxy;
};

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

	constructor() {
		this.snapshot = snapshot;
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
	let seq: number;
	let logger: ITelemetryLoggerExt;

	function generateSavedOp(): ISequencedDocumentMessage {
		return {
			clientId: "Some client ID",
			minimumSequenceNumber: 0,
			sequenceNumber: seq++,
			type: MessageType.Operation,
		} as any as ISequencedDocumentMessage;
	}

	beforeEach(async () => {
		seq = 1;
		logger = createChildLogger({ namespace: "fluid:testSerializedStateManager" });
	});

	it("can't get pending local state when offline load disabled", async () => {
		const storageAdapter = new MockStorageAdapter();
		const serializedStateManager = new SerializedStateManager(
			undefined,
			logger,
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
			logger,
			failProxy(), // no calls to storage expected
			true,
		);
		// equivalent to attach
		serializedStateManager.setSnapshot({
			baseSnapshot: { trees: {}, blobs: {} },
			snapshotBlobs: {},
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
			logger,
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
			logger,
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
		const deferred = new Deferred<void>();
		const cb = () => {
			deferred.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger,
			storageAdapter,
			true,
			cb,
		);
		for (let num = 0; num < 10; ++num) {
			serializedStateManager.addProcessedOp(generateSavedOp());
		}
		const { baseSnapshot, version } = await serializedStateManager.fetchSnapshot(
			undefined,
			false,
		);
		assert.strictEqual(baseSnapshot.id, "fromPending");
		assert.strictEqual(version, undefined);
		const state = await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
		const parsed = JSON.parse(state);
		// We keep using the pending snapshot since it is the same based on its sequence number 0
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
		const deferred = new Deferred<void>();
		const cb = () => {
			deferred.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger,
			storageAdapter,
			true,
			cb,
		);

		const processedOpsSize = 20;
		seq = 13; // greater than snapshotSequenceNumber + 1
		for (let num = 0; num < processedOpsSize; ++num) {
			serializedStateManager.addProcessedOp(generateSavedOp());
		}
		const snapshotSequenceNumber = 11;
		storageAdapter.uploadSummary(snapshotSequenceNumber);
		await serializedStateManager.fetchSnapshot(undefined, false);
		await deferred.promise;
		const state = await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
		const parsed = JSON.parse(state) as IPendingContainerState;
		assert.strictEqual(parsed.baseSnapshot.id, "fromPending");
	});

	it("get same pending snapshot when we capture before refreshing", async () => {
		const pending: IPendingContainerState = {
			...pendingLocalState,
			baseSnapshot: { ...snapshot, id: "fromPending" },
		};
		const storageAdapter = new MockStorageAdapter();
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger,
			storageAdapter,
			true,
		);

		const processedOpsSize = 20;
		for (let num = 0; num < processedOpsSize; ++num) {
			serializedStateManager.addProcessedOp(generateSavedOp());
		}

		const snapshotSequenceNumber = 11;
		storageAdapter.uploadSummary(snapshotSequenceNumber);

		await serializedStateManager.fetchSnapshot(undefined, false);
		// no waiting for refresh
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
		const deferred = new Deferred<void>();
		const cb = () => {
			deferred.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger,
			storageAdapter,
			true,
			cb,
		);

		const processedOpsSize = 20;
		for (let num = 0; num < processedOpsSize; ++num) {
			serializedStateManager.addProcessedOp(generateSavedOp());
		}

		const snapshotSequenceNumber = 11;
		storageAdapter.uploadSummary(snapshotSequenceNumber);

		await serializedStateManager.fetchSnapshot(undefined, false);
		await deferred.promise;
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
			processedOpsSize,
			"wrong last saved op",
		);
	});

	it("refresh snapshot when there are no processed ops", async () => {
		const pending: IPendingContainerState = {
			...pendingLocalState,
			baseSnapshot: { ...snapshot, id: "fromPending" },
		};
		const storageAdapter = new MockStorageAdapter();
		const deferred = new Deferred<void>();
		const cb = () => {
			deferred.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger,
			storageAdapter,
			true,
			cb,
		);
		const snapshotSequenceNumber = 11;
		storageAdapter.uploadSummary(snapshotSequenceNumber);

		await serializedStateManager.fetchSnapshot(undefined, false);
		await deferred.promise;
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
		assert.strictEqual(parsed.savedOps.length, 0, "should be no savedOps");
	});

	it("refresh snapshot when snapshot sequence number is above processed ops", async () => {
		const pending: IPendingContainerState = {
			...pendingLocalState,
			baseSnapshot: { ...snapshot, id: "fromPending" },
		};
		const storageAdapter = new MockStorageAdapter();
		const deferred = new Deferred<void>();
		const cb = () => {
			deferred.resolve();
		};
		const serializedStateManager = new SerializedStateManager(
			pending,
			logger,
			storageAdapter,
			true,
			cb,
		);
		const processedOpsSize1 = 20;
		for (let num = 0; num < processedOpsSize1; ++num) {
			serializedStateManager.addProcessedOp(generateSavedOp());
		}

		const snapshotSequenceNumber = 22;
		storageAdapter.uploadSummary(snapshotSequenceNumber);

		await serializedStateManager.fetchSnapshot(undefined, false);
		const processedOpsSize2 = 10;
		for (let num = 0; num < processedOpsSize2; ++num) {
			serializedStateManager.addProcessedOp(generateSavedOp());
		}
		await deferred.promise;
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
			processedOpsSize1 + processedOpsSize2,
			"wrong last saved op",
		);
	});
});
