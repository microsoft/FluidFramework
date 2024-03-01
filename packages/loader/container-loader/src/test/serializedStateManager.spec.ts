/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryLoggerExt, createChildLogger } from "@fluidframework/telemetry-utils";
import {
	IVersion,
	ISnapshotTree,
	MessageType,
	ISequencedDocumentMessage,
	IDocumentAttributes,
} from "@fluidframework/protocol-definitions";
import {
	FetchSource,
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
	ISnapshotFetchOptions,
} from "@fluidframework/driver-definitions";
import { IGetPendingLocalStateProps, IRuntime } from "@fluidframework/container-definitions";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { IPendingContainerState } from "../container.js";
import { SerializedStateManager } from "../serializedStateManager.js";

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
	private readonly snapshots: ISnapshotTree[] = [];

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
		this.snapshots.push(baseSnapshot);
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
		const lastSnapshot = this.snapshots[this.snapshots.length - 1];
		return lastSnapshot ?? null;
	}

	public async getVersions(
		// eslint-disable-next-line @rushstack/no-new-null
		versionId: string | null,
		count: number,
		scenarioName?: string | undefined,
		fetchSource?: FetchSource | undefined,
	): Promise<IVersion[]> {
		return [{ id: "test", treeId: "test" }];
	}
	public async readBlob(id: string): Promise<ArrayBufferLike> {
		return this.blobs.get(id) as ArrayBufferLike;
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

	function generateSavedOp(type: MessageType = MessageType.Operation): ISequencedDocumentMessage {
		return {
			clientId: "Some client ID",
			minimumSequenceNumber: 0,
			sequenceNumber: seq++,
			type,
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

	it("can't get pending local state when there is no base snapshot", async () => {
		const storageAdapter = new MockStorageAdapter();
		const serializedStateManager = new SerializedStateManager(
			undefined,
			logger,
			storageAdapter,
			true,
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
			(error: Error) => errorFn(error, "no base data"),
			"container can get local state with no base snapshot",
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
		const { snapshotTree, version } = await serializedStateManager.fetchSnapshot(
			undefined,
			undefined,
		);
		assert(snapshotTree);
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
		serializedStateManager.setSnapshot({ tree: { trees: {}, blobs: {} }, blobs: {} });
		for (let num = 0; num < 10; ++num) {
			serializedStateManager.addSavedOp(generateSavedOp());
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
		const { snapshotTree, version } = await serializedStateManager.fetchSnapshot(
			undefined,
			undefined,
		);
		assert(snapshotTree);
		assert.strictEqual(version?.id, "test");
		assert.strictEqual(version.treeId, "test");
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
});
