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
} from "@fluidframework/protocol-definitions";
import {
	FetchSource,
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
	ISnapshotFetchOptions,
} from "@fluidframework/driver-definitions";
import { IGetPendingLocalStateProps, IRuntime } from "@fluidframework/container-definitions";
import { IPendingContainerState } from "../container";
import { SerializedStateManager } from "../serializedStateManager";
import { ISerializableBlobContents } from "../containerStorageAdapter";

type ISerializedStateManagerDocumentTorageService = Pick<
	IDocumentStorageService,
	"getSnapshot" | "getSnapshotTree" | "getVersions" | "readBlob"
>;

abstract class BaseMockStorageAdapter implements ISerializedStateManagerDocumentTorageService {
	public abstract getSnapshot(
		snapshotFetchOptions?: ISnapshotFetchOptions | undefined,
	): Promise<ISnapshot>;
	public abstract getSnapshotTree(
		version?: IVersion | undefined,
		scenarioName?: string | undefined,
	): Promise<ISnapshotTree | null>;
	public abstract getVersions(
		versionId: string | null,
		count: number,
		scenarioName?: string | undefined,
		fetchSource?: FetchSource | undefined,
	): Promise<IVersion[]>;
	public abstract readBlob(id: string): Promise<ArrayBufferLike>;
}

class MockStorageAdapter extends BaseMockStorageAdapter {
	public async getSnapshot(
		snapshotFetchOptions?: ISnapshotFetchOptions | undefined,
	): Promise<ISnapshot> {
		throw new Error("Method not implemented.");
	}
	public async getSnapshotTree(
		version?: IVersion | undefined,
		scenarioName?: string | undefined,
	): Promise<ISnapshotTree | null> {
		throw new Error("Method not implemented.");
	}
	public async getVersions(
		versionId: string | null,
		count: number,
		scenarioName?: string | undefined,
		fetchSource?: FetchSource | undefined,
	): Promise<IVersion[]> {
		throw new Error("Method not implemented.");
	}
	public async readBlob(id: string): Promise<ArrayBufferLike> {
		throw new Error("Method not implemented.");
	}
}
type ISerializedStateManagerRuntime = Pick<IRuntime, "getPendingLocalState">;

class MockRuntime implements ISerializedStateManagerRuntime {
	private generatePendingOp() {
		return {
			type: "message",
			referenceSequenceNumber: 0,
			content: {},
			localOpMetadata: {},
			opMetadata: "",
		};
	}

	public getPendingLocalState(props?: IGetPendingLocalStateProps | undefined): unknown {
		return { pending: this.generatePendingOp() };
	}
}

const snapshotTreeWithGroupId: ISnapshotTree = {
	id: "SnapshotId",
	blobs: {},
	trees: {
		".protocol": {
			blobs: {},
			trees: {},
		},
		".app": {
			blobs: { ".metadata": "bARD4RKvW4LL1KmaUKp6hUMSp" },
			trees: {
				".channels": {
					blobs: {},
					trees: {
						default: {
							blobs: {},
							trees: {
								dds: {
									blobs: {},
									trees: {},
								},
							},
							groupId: "G3",
						},
					},
					unreferenced: true,
					groupId: "G2",
				},
				".blobs": { blobs: {}, trees: {} },
			},
			unreferenced: true,
			groupId: "G4",
		},
	},
};

const blobContents: ISerializableBlobContents = {
	key1: "value1",
	key2: "value2",
	key3: "value3",
};

const pendingLocalState: IPendingContainerState = {
	baseSnapshot: { blobs: {}, trees: {} },
	snapshotBlobs: {},
	pendingRuntimeState: {},
	savedOps: [],
	url: "fluid",
};
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

describe("serializedStateManager", () => {
	let clientSeqNumber = 0;
	let seq: number;
	let logger: ITelemetryLoggerExt;

	function generateOp(type: MessageType = MessageType.Operation): ISequencedDocumentMessage {
		return {
			clientId: "Some client ID",
			clientSequenceNumber: ++clientSeqNumber,
			minimumSequenceNumber: 0,
			sequenceNumber: seq++,
			type,
		} as any as ISequencedDocumentMessage;
	}

	beforeEach(async () => {
		// seq = 1;
		// clientSeqNumber = 0;
		logger = createChildLogger({ namespace: "fluid:testSerializedStateManager" });
	});

	it("can't get pending local state when offline load disabled", async () => {
		const storageAdapter = new MockStorageAdapter();
		const serializedStateManager = new SerializedStateManager(
			pendingLocalState,
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
			pendingLocalState,
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

	it("can get pending local state", async () => {
		const storageAdapter = new MockStorageAdapter();
		const serializedStateManager = new SerializedStateManager(
			pendingLocalState,
			logger,
			storageAdapter,
			true,
		);
		serializedStateManager.setSnapshot({ tree: snapshotTreeWithGroupId, blobs: blobContents });
		for (let num = 0; num < 100; ++num) {
			serializedStateManager.addSavedOp(generateOp());
		}
		await serializedStateManager.getPendingLocalStateCore(
			{ notifyImminentClosure: false },
			"clientId",
			new MockRuntime(),
			resolvedUrl,
		);
	});
});
