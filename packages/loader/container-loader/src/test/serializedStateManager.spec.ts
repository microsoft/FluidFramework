/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { IGetPendingLocalStateProps, IRuntime } from "@fluidframework/container-definitions";
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

interface IPendingMessage {
	type: "message";
	referenceSequenceNumber: number;
	content: string;
}

class MockStorageAdapter implements ISerializedStateManagerDocumentStorageService {
	private readonly blobs = new Map<string, ArrayBufferLike>();
	private readonly snapshot: ISnapshotTree;

	constructor() {
		const baseSnapshot: ISnapshotTree = {
			id: "SnapshotId",
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
		this.snapshot = baseSnapshot;
		this.blobs.set(
			"attributesId",
			stringToBuffer(`{"minimumSequenceNumber" : 0, "sequenceNumber": 0}`, "utf8"),
		);
	}

	public async getSnapshot(
		snapshotFetchOptions?: ISnapshotFetchOptions | undefined,
	): Promise<ISnapshot> {
		throw new Error("Method not implemented.");
	}
	public async getSnapshotTree(
		version?: IVersion | undefined,
		scenarioName?: string | undefined,
		// eslint-disable-next-line @rushstack/no-new-null
	): Promise<ISnapshotTree | null> {
		return this.snapshot;
	}

	public async getVersions(
		// eslint-disable-next-line @rushstack/no-new-null
		versionId: string | null,
		count: number,
		scenarioName?: string | undefined,
		fetchSource?: FetchSource | undefined,
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
	private pendingOps: IPendingMessage[] = [];
	public generatePendingOp(rfs) {
		this.pendingOps.push({
			type: "message",
			referenceSequenceNumber: rfs,
			content: "",
		});
	}

	public getPendingLocalState(props?: IGetPendingLocalStateProps | undefined): unknown {
		const result = [...this.pendingOps];
		this.pendingOps = [];
		return { pending: result };
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

	it("can get snapshot from previous local state", async () => {
		const pendingLocalState: IPendingContainerState = {
			attached: true,
			baseSnapshot: { id: "fromPending", blobs: {}, trees: {} },
			snapshotBlobs: {},
			pendingRuntimeState: {},
			savedOps: [],
			url: "fluid",
		};
		const storageAdapter = new MockStorageAdapter();
		const serializedStateManager = new SerializedStateManager(
			pendingLocalState,
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

	it("can get pending local state after attach", async () => {
		const storageAdapter = new MockStorageAdapter();
		const serializedStateManager = new SerializedStateManager(
			undefined,
			logger,
			storageAdapter,
			true,
		);
		// equivalent to attach
		serializedStateManager.setSnapshot({
			baseSnapshot: { trees: {}, blobs: {} },
			snapshotBlobs: {},
		});
		for (let num = 0; num < 10; ++num) {
			serializedStateManager.addProcessedOp(generateSavedOp());
		}
		await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
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
		assert.strictEqual(version?.id, "SnapshotId");
		assert.strictEqual(version.treeId, "SnapshotId");
		const state = await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
		const parsed = JSON.parse(state);
		assert.strictEqual(parsed.baseSnapshot.id, "SnapshotId");
		const attributes = getAttributesFromPendingState(parsed);
		assert.strictEqual(attributes.sequenceNumber, 0);
		assert.strictEqual(attributes.minimumSequenceNumber, 0);
	});

	it("fetched snapshot is the same as pending snapshot", async () => {
		const pendingSnapshot: ISnapshotTree = {
			id: "fromPending",
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
			baseSnapshot: pendingSnapshot,
			snapshotBlobs: { attributesId: '{"minimumSequenceNumber" : 0, "sequenceNumber": 0}' },
			pendingRuntimeState: {},
			savedOps: [],
			url: "fluid",
		};
		const storageAdapter = new MockStorageAdapter();
		const serializedStateManager = new SerializedStateManager(
			pendingLocalState,
			logger,
			storageAdapter,
			true,
		);
		for (let num = 0; num < 10; ++num) {
			serializedStateManager.addProcessedOp(generateSavedOp());
		}
		const { baseSnapshot, version } = await serializedStateManager.fetchSnapshot(
			undefined,
			false,
		);
		const flushPromises = async () => new Promise(setImmediate);
		await flushPromises();
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

	it("refresh snapshot when snapshot sequence number is among processed ops", async () => {
		const pendingSnapshot: ISnapshotTree = {
			id: "fromPending",
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
			baseSnapshot: pendingSnapshot,
			snapshotBlobs: { attributesId: '{"minimumSequenceNumber" : 0, "sequenceNumber": 0}' },
			pendingRuntimeState: {},
			savedOps: [],
			url: "fluid",
		};
		const storageAdapter = new MockStorageAdapter();
		const serializedStateManager = new SerializedStateManager(
			pendingLocalState,
			logger,
			storageAdapter,
			true,
		);
		for (let num = 0; num < 10; ++num) {
			serializedStateManager.addProcessedOp(generateSavedOp());
		}
		storageAdapter.uploadSummary(seq);
		for (let num = 0; num < 10; ++num) {
			serializedStateManager.addProcessedOp(generateSavedOp());
		}
		const { baseSnapshot, version } = await serializedStateManager.fetchSnapshot(
			undefined,
			false,
		);
		const flushPromises = async () => new Promise(setImmediate);
		await flushPromises();
		assert.strictEqual(baseSnapshot.id, "fromPending");
		assert.strictEqual(version, undefined);
		const state = await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
		const parsed = JSON.parse(state);
		// Refresh!
		assert.strictEqual(parsed.baseSnapshot.id, "SnapshotId");
		// const attributes = getAttributesFromPendingState(parsed);
		// assert.strictEqual(attributes.sequenceNumber, 0);
		// assert.strictEqual(attributes.minimumSequenceNumber, 0);
	});
});
