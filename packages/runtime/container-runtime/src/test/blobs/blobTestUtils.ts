/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	bufferToString,
	createEmitter,
	gitHashFile,
	IsoBuffer,
	TypedEventEmitter,
} from "@fluid-internal/client-utils";
import {
	AttachState,
	type IContainerStorageService,
} from "@fluidframework/container-definitions/internal";
import type { IContainerRuntimeEvents } from "@fluidframework/container-runtime-definitions/internal";
import type {
	IFluidHandle,
	IFluidHandleContext,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces/internal";
import { SummaryType } from "@fluidframework/driver-definitions/internal";
import type { ISequencedMessageEnvelope } from "@fluidframework/runtime-definitions/internal";
import {
	isFluidHandleInternalPayloadPending,
	isLocalFluidHandle,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import {
	BlobManager,
	type IBlobManagerLoadInfo,
	type IBlobManagerRuntime,
	type ICreateBlobResponseWithTTL,
	type IPendingBlobs,
	redirectTableBlobName,
} from "../../blobManager/index.js";
import type { IBlobMetadata } from "../../metadata.js";

export const MIN_TTL = 24 * 60 * 60; // same as ODSP

interface MockBlobStorageInternalEvents {
	blobCreated: (id: string, minTTLOverride?: number | undefined) => void;
	blobCreateFailed: (id: string, error: Error) => void;
	blobReceived: () => void;
}

interface BlobProcessOptions {
	error?: Error;
	minTTLOverride?: number | undefined;
}

export class MockBlobStorage
	implements Pick<IContainerStorageService, "createBlob" | "readBlob">
{
	public defaultMinTTL: number = MIN_TTL;

	public readonly blobs: Map<string, ArrayBufferLike> = new Map();
	public readonly unprocessedBlobs: [string, ArrayBufferLike][] = [];

	private readonly internalEvents = createEmitter<MockBlobStorageInternalEvents>();
	private _blobsProcessed = 0;
	public get blobsProcessed(): number {
		return this._blobsProcessed;
	}

	public constructor(private readonly dedupe: boolean) {}

	private _paused: boolean = false;
	public pause = (): void => {
		this._paused = true;
	};

	public unpause = (): void => {
		this._paused = false;
		this.processAll();
	};

	public readonly createBlob = async (
		blob: ArrayBufferLike,
	): Promise<ICreateBlobResponseWithTTL> => {
		let id: string;
		if (this.dedupe) {
			const s = bufferToString(blob, "base64");
			id = await gitHashFile(IsoBuffer.from(s, "base64"));
		} else {
			id = this.blobs.size.toString();
		}
		this.unprocessedBlobs.push([id, blob]);

		const blobCreatedP = new Promise<{ minTTLOverride?: number | undefined }>(
			(resolve, reject) => {
				const onBlobCreated = (_id: string, _minTTLOverride?: number | undefined) => {
					if (_id === id) {
						this.internalEvents.off("blobCreated", onBlobCreated);
						this.internalEvents.off("blobCreateFailed", onBlobCreateFailed);
						resolve({ minTTLOverride: _minTTLOverride });
					}
				};
				const onBlobCreateFailed = (_id: string, error: Error) => {
					if (_id === id) {
						this.internalEvents.off("blobCreated", onBlobCreated);
						this.internalEvents.off("blobCreateFailed", onBlobCreateFailed);
						reject(error);
					}
				};
				this.internalEvents.on("blobCreated", onBlobCreated);
				this.internalEvents.on("blobCreateFailed", onBlobCreateFailed);
			},
		);

		this.internalEvents.emit("blobReceived");

		if (!this._paused) {
			this.processAll();
		}

		const { minTTLOverride } = await blobCreatedP;
		this._blobsProcessed++;

		return { id, minTTLInSeconds: minTTLOverride ?? this.defaultMinTTL };
	};

	public readonly readBlob = async (id: string): Promise<ArrayBufferLike> => {
		const blob = this.blobs.get(id);
		assert(blob !== undefined, `Couldn't find blob ${id}`);
		return blob;
	};

	private readonly waitBlobAvailable = async (): Promise<void> => {
		if (this.unprocessedBlobs.length === 0) {
			return new Promise<void>((resolve) => {
				const onBlobReceived = () => {
					resolve();
					this.internalEvents.off("blobReceived", onBlobReceived);
				};
				this.internalEvents.on("blobReceived", onBlobReceived);
			});
		}
	};

	public readonly processOne = (processOptions?: BlobProcessOptions): void => {
		const { error, minTTLOverride } = processOptions ?? {};
		const next = this.unprocessedBlobs.shift();
		assert(next !== undefined, "Tried processing, but none to process");

		const [id, blob] = next;
		if (error === undefined) {
			this.blobs.set(id, blob);
			this.internalEvents.emit("blobCreated", id, minTTLOverride);
		} else {
			this.internalEvents.emit("blobCreateFailed", id, error);
		}
	};

	public readonly waitProcessOne = async (
		processOptions?: BlobProcessOptions,
	): Promise<void> => {
		assert(
			this._paused,
			"waitProcessOne is only available in paused mode to avoid conflicting with normal blob processing",
		);
		await this.waitBlobAvailable();
		this.processOne(processOptions);
	};

	public readonly processAll = (): void => {
		while (this.unprocessedBlobs.length > 0) {
			this.processOne();
		}
	};
}

export class MockStorageAdapter
	implements Pick<IContainerStorageService, "createBlob" | "readBlob">
{
	public readonly detachedStorage = new MockBlobStorage(false);
	public readonly attachedStorage = new MockBlobStorage(true);
	public readonly pause = (): void => {
		this.getCurrentStorage().pause();
	};
	public readonly unpause = (): void => {
		this.getCurrentStorage().unpause();
	};
	public get blobsProcessed(): number {
		return this.getCurrentStorage().blobsProcessed;
	}
	public constructor(private attached: boolean) {}
	public readonly simulateAttach = async (
		patchRedirectTable: BlobManager["patchRedirectTable"],
	): Promise<void> => {
		assert(!this.attached, "Can't simulate attach twice");
		// At least under current patterns, detached storage should always process blobs immediately.
		assert(
			this.detachedStorage.unprocessedBlobs.length === 0,
			"Detached storage has unprocessed blobs",
		);
		// This is simulating the behavior in the loader layer during container attach (see attachment.ts).
		// We upload all of the blobs that we're holding in detached storage to the real storage,
		// and then call BlobManager.patchRedirectTable() with a mapping of the prior detached storage
		// IDs to their respective real storage IDs.
		const detachedToAttachedMappings = await Promise.all(
			[...this.detachedStorage.blobs].map(async ([detachedStorageId, blob]) => {
				return this.attachedStorage.createBlob(blob).then(({ id: attachedStorageId }) => {
					return [detachedStorageId, attachedStorageId] as const;
				});
			}),
		);
		const redirectTable = new Map(detachedToAttachedMappings);
		patchRedirectTable(redirectTable);

		this.attached = true;
	};
	private readonly getCurrentStorage = (): MockBlobStorage =>
		this.attached ? this.attachedStorage : this.detachedStorage;
	public readonly createBlob = async (
		blob: ArrayBufferLike,
	): Promise<ICreateBlobResponseWithTTL> => this.getCurrentStorage().createBlob(blob);

	public readBlob = async (id: string): Promise<ArrayBufferLike> =>
		this.getCurrentStorage().readBlob(id);

	public readonly processOne = (processOptions?: BlobProcessOptions): void => {
		this.getCurrentStorage().processOne(processOptions);
	};

	public readonly waitProcessOne = async (
		processOptions?: BlobProcessOptions,
	): Promise<void> => {
		return this.getCurrentStorage().waitProcessOne(processOptions);
	};
}

export interface UnprocessedOp {
	clientId: string;
	metadata: IBlobMetadata;
}

interface MockOrderingServiceEvents {
	opDropped: (op: UnprocessedOp) => void;
	opReceived: (op: UnprocessedOp) => void;
	opSequenced: (op: ISequencedMessageEnvelope) => void;
}

class MockOrderingService {
	public readonly unprocessedOps: UnprocessedOp[] = [];
	public readonly events = createEmitter<MockOrderingServiceEvents>();
	public messagesReceived = 0;

	private _paused: boolean = false;
	public pause = () => {
		this._paused = true;
	};

	public unpause = () => {
		this._paused = false;
		this.sequenceAll();
	};

	private readonly waitOpAvailable = async (): Promise<void> => {
		if (this.unprocessedOps.length === 0) {
			return new Promise<void>((resolve) => {
				const onOpReceived = (op: UnprocessedOp) => {
					resolve();
					this.events.off("opReceived", onOpReceived);
				};
				this.events.on("opReceived", onOpReceived);
			});
		}
	};

	public readonly sequenceOne = () => {
		const op = this.unprocessedOps.shift();
		assert(op !== undefined, "Tried sequencing, but none to sequence");
		// BlobManager only checks the metadata, so this cast is good enough.
		this.events.emit("opSequenced", op as ISequencedMessageEnvelope);
	};

	public readonly waitSequenceOne = async () => {
		assert(
			this._paused,
			"waitSequenceOne is only available in paused mode to avoid conflicting with normal sequencing",
		);
		await this.waitOpAvailable();
		this.sequenceOne();
	};

	// Sequence all unprocessed ops. The events emitted can be used to drive normal processing scenarios.
	public readonly sequenceAll = () => {
		while (this.unprocessedOps.length > 0) {
			this.sequenceOne();
		}
	};

	public readonly dropOne = () => {
		const op = this.unprocessedOps.shift();
		assert(op !== undefined, "Tried dropping, but none to drop");
		this.events.emit("opDropped", op);
	};

	public readonly waitDropOne = async () => {
		assert(
			this._paused,
			"waitDropOne is only available in paused mode to avoid conflicting with normal sequencing",
		);
		await this.waitOpAvailable();
		this.dropOne();
	};

	// Drop all unprocessed ops. The events emitted can be used to drive resubmit scenarios.
	public readonly dropAll = () => {
		// Only drop the current unprocessed ops, since this will trigger resubmit and we don't
		// necessarily want to drop those too.
		const numberToDrop = this.unprocessedOps.length;
		for (let i = 0; i < numberToDrop; i++) {
			this.dropOne();
		}
	};

	public readonly sendBlobAttachOp = (clientId: string, localId: string, remoteId: string) => {
		const op: UnprocessedOp = {
			clientId,
			metadata: { localId, blobId: remoteId },
		};
		this.unprocessedOps.push(op);
		this.messagesReceived++;
		this.events.emit("opReceived", op);
		if (!this._paused) {
			this.sequenceAll();
		}
	};
}

class MockGarbageCollector {
	public readonly deletedBlobs: Set<string> = new Set();
	public readonly simulateBlobDeletion = (blobPath: string) => {
		this.deletedBlobs.add(blobPath);
	};
	public readonly isBlobDeleted = (blobPath: string) => {
		return this.deletedBlobs.has(blobPath);
	};
}

class MockRuntime
	extends TypedEventEmitter<IContainerRuntimeEvents>
	implements IBlobManagerRuntime
{
	private _attachState: AttachState = AttachState.Detached;
	public get attachState() {
		return this._attachState;
	}
	public set attachState(value: AttachState) {
		this._attachState = value;
		if (this._attachState === AttachState.Attached) {
			this.emit("attached");
		}
	}
	public get isAttached() {
		return this._attachState === AttachState.Attached;
	}
	public disposed: boolean = false;
	public constructor(
		public readonly baseLogger: ITelemetryBaseLogger,
		attached: boolean,
	) {
		super();
		this._attachState = attached ? AttachState.Attached : AttachState.Detached;
	}
}

interface TestMaterial {
	clientId: string;
	attached: boolean;
	mockBlobStorage: MockStorageAdapter;
	mockOrderingService: MockOrderingService;
	mockGarbageCollector: MockGarbageCollector;
	mockLogger: MockLogger;
	mockRuntime: MockRuntime;
	blobManagerLoadInfo: IBlobManagerLoadInfo;
	pendingBlobs: IPendingBlobs | undefined;
	createBlobPayloadPending: boolean;
	blobManager: BlobManager;
}

type TestMaterialOverrides = Partial<Omit<TestMaterial, "blobManager">>;

export const createTestMaterial = (
	overrides?: TestMaterialOverrides | undefined,
): TestMaterial => {
	const clientId = overrides?.clientId ?? uuid();
	const attached = overrides?.attached ?? true;
	const mockBlobStorage = overrides?.mockBlobStorage ?? new MockStorageAdapter(attached);
	const mockOrderingService = overrides?.mockOrderingService ?? new MockOrderingService();
	const mockGarbageCollector = overrides?.mockGarbageCollector ?? new MockGarbageCollector();
	const mockLogger = overrides?.mockLogger ?? new MockLogger();
	const mockRuntime = overrides?.mockRuntime ?? new MockRuntime(mockLogger, attached);
	const blobManagerLoadInfo = overrides?.blobManagerLoadInfo ?? {};
	const pendingBlobs = overrides?.pendingBlobs ?? undefined;
	const createBlobPayloadPending = overrides?.createBlobPayloadPending ?? false;

	const blobManager = new BlobManager({
		// The routeContext is only needed by the BlobHandles to determine isAttached, so this
		// cast is good enough
		routeContext: mockRuntime as unknown as IFluidHandleContext,
		blobManagerLoadInfo,
		storage: mockBlobStorage,
		sendBlobAttachOp: (localId: string, storageId: string) =>
			mockOrderingService.sendBlobAttachOp(clientId, localId, storageId),
		blobRequested: () => undefined,
		isBlobDeleted: mockGarbageCollector.isBlobDeleted,
		runtime: mockRuntime,
		pendingBlobs,
		createBlobPayloadPending,
	});

	mockOrderingService.events.on("opSequenced", (op: ISequencedMessageEnvelope) => {
		blobManager.processBlobAttachMessage(op, op.clientId === clientId);
	});

	mockOrderingService.events.on("opDropped", (op: UnprocessedOp) => {
		if (op.clientId === clientId) {
			blobManager.reSubmit(op.metadata as unknown as Record<string, unknown>);
		}
	});

	return {
		clientId,
		attached,
		mockBlobStorage,
		mockOrderingService,
		mockGarbageCollector,
		mockLogger,
		mockRuntime,
		blobManagerLoadInfo,
		pendingBlobs,
		createBlobPayloadPending,
		blobManager,
	};
};

export const simulateAttach = async (
	storage: MockStorageAdapter,
	runtime: MockRuntime,
	blobManager: BlobManager,
): Promise<void> => {
	assert(runtime.attachState === AttachState.Detached, "Container must be detached");
	await storage.simulateAttach(blobManager.patchRedirectTable);
	assert(runtime.attachState === AttachState.Detached, "Container must be detached");
	// Blob storage transfer and redirect table set happens before the runtime transitions to Attaching.
	runtime.attachState = AttachState.Attaching;
	// TODO: Probably want to test stuff between these states
	runtime.attachState = AttachState.Attached;
};

export const getSummaryContentsWithFormatValidation = (
	blobManager: BlobManager,
): IBlobManagerLoadInfo => {
	const summary = blobManager.summarize();
	let ids: string[] | undefined;
	let redirectTable: [string, string][] | undefined;
	for (const [key, summaryObject] of Object.entries(summary.summary.tree)) {
		if (summaryObject.type === SummaryType.Attachment) {
			ids ??= [];
			ids.push(summaryObject.id);
		} else {
			assert.strictEqual(key, redirectTableBlobName);
			assert(summaryObject.type === SummaryType.Blob);
			assert(typeof summaryObject.content === "string");
			redirectTable = [
				...new Map<string, string>(
					JSON.parse(summaryObject.content) as [string, string][],
				).entries(),
			];
		}
	}
	return { ids, redirectTable };
};

export const textToBlob = (text: string): ArrayBufferLike => {
	const encoder = new TextEncoder();
	return encoder.encode(text).buffer;
};

export const blobToText = (blob: ArrayBufferLike): string => {
	const decoder = new TextDecoder();
	return decoder.decode(blob);
};

export const unpackHandle = (
	handle: IFluidHandle,
): {
	absolutePath: string;
	localId: string;
	payloadPending: boolean;
} => {
	const internalHandle = toFluidHandleInternal(handle);
	const pathParts = internalHandle.absolutePath.split("/");
	return {
		absolutePath: internalHandle.absolutePath,
		localId: pathParts[2],
		payloadPending: isFluidHandleInternalPayloadPending(internalHandle),
	};
};

export const waitHandlePayloadShared = async (handle: IFluidHandle): Promise<void> => {
	if (isLocalFluidHandle(handle) && handle.payloadState !== "shared") {
		return new Promise<void>((resolve, reject) => {
			const onPayloadShared = () => {
				resolve();
				handle.events.off("payloadShared", onPayloadShared);
				handle.events.off("payloadShareFailed", onPayloadShareFailed);
			};
			const onPayloadShareFailed = (error: unknown) => {
				reject(error);
				handle.events.off("payloadShared", onPayloadShared);
				handle.events.off("payloadShareFailed", onPayloadShareFailed);
			};
			handle.events.on("payloadShared", onPayloadShared);
			handle.events.on("payloadShareFailed", onPayloadShareFailed);
		});
	}
};

export const attachHandle = (handle: IFluidHandle): void => {
	const internalHandle = toFluidHandleInternal(handle);
	if (!internalHandle.isAttached) {
		internalHandle.attachGraph();
	}
};

export const ensureBlobsShared = async (handles: IFluidHandle[]): Promise<void[]> => {
	return Promise.all(
		handles.map(async (handle) => {
			attachHandle(handle);
			return waitHandlePayloadShared(handle);
		}),
	);
};
