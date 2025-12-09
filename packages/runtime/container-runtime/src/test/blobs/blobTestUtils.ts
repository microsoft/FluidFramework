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

interface MockBlobStorageEvents {
	blobCreated: (id: string, minTTLOverride?: number | undefined) => void;
	blobCreateFailed: (id: string, error: Error) => void;
	blobReceived: () => void;
}

interface BlobCreateOptions {
	error?: Error;
	minTTLOverride?: number | undefined;
}

export const getSerializedBlobForString = (str: string): string =>
	bufferToString(textToBlob(str), "base64");

export const getDedupedStorageIdForString = async (str: string): Promise<string> =>
	getDedupedStorageId(textToBlob(str));

export const getDedupedStorageId = async (blob: ArrayBufferLike): Promise<string> =>
	gitHashFile(IsoBuffer.from(bufferToString(blob, "base64"), "base64"));

export class MockBlobStorage
	implements Pick<IContainerStorageService, "createBlob" | "readBlob">
{
	public defaultMinTTL: number = MIN_TTL;

	public readonly blobs: Map<string, ArrayBufferLike> = new Map();
	public readonly pendingBlobs: [string, ArrayBufferLike][] = [];

	public readonly events = createEmitter<MockBlobStorageEvents>();
	private _blobsReceived = 0;
	public get blobsReceived(): number {
		return this._blobsReceived;
	}
	private _blobsCreated = 0;
	public get blobsCreated(): number {
		return this._blobsCreated;
	}

	public constructor(private readonly dedupe: boolean) {}

	private _paused: boolean = false;
	public pause = (): void => {
		this._paused = true;
	};

	public unpause = (): void => {
		this._paused = false;
		this.createAll();
	};

	public readonly createBlob = async (
		blob: ArrayBufferLike,
	): Promise<ICreateBlobResponseWithTTL> => {
		const id = this.dedupe ? await getDedupedStorageId(blob) : this.blobs.size.toString();
		this.pendingBlobs.push([id, blob]);
		this._blobsReceived++;

		const blobCreatedP = new Promise<{ minTTLOverride?: number | undefined }>(
			(resolve, reject) => {
				const onBlobCreated = (_id: string, _minTTLOverride?: number | undefined) => {
					if (_id === id) {
						this.events.off("blobCreated", onBlobCreated);
						this.events.off("blobCreateFailed", onBlobCreateFailed);
						resolve({ minTTLOverride: _minTTLOverride });
					}
				};
				const onBlobCreateFailed = (_id: string, error: Error) => {
					if (_id === id) {
						this.events.off("blobCreated", onBlobCreated);
						this.events.off("blobCreateFailed", onBlobCreateFailed);
						reject(error);
					}
				};
				this.events.on("blobCreated", onBlobCreated);
				this.events.on("blobCreateFailed", onBlobCreateFailed);
			},
		);

		this.events.emit("blobReceived");

		if (!this._paused) {
			this.createAll();
		}

		const { minTTLOverride } = await blobCreatedP;
		this._blobsCreated++;

		return { id, minTTLInSeconds: minTTLOverride ?? this.defaultMinTTL };
	};

	public readonly readBlob = async (id: string): Promise<ArrayBufferLike> => {
		const blob = this.blobs.get(id);
		assert(blob !== undefined, `Couldn't find blob ${id}`);
		return blob;
	};

	/**
	 * Waits until at least one blob is available to be created. This is useful to confirm
	 * the BlobManager is awaiting the upload to complete.
	 */
	public readonly waitBlobAvailable = async (): Promise<void> => {
		if (this.pendingBlobs.length === 0) {
			return new Promise<void>((resolve) => {
				const onBlobReceived = () => {
					resolve();
					this.events.off("blobReceived", onBlobReceived);
				};
				this.events.on("blobReceived", onBlobReceived);
			});
		}
	};

	public readonly createOne = (createOptions?: BlobCreateOptions): void => {
		const { error, minTTLOverride } = createOptions ?? {};
		const next = this.pendingBlobs.shift();
		assert(next !== undefined, "Tried processing, but none to process");

		const [id, blob] = next;
		if (error === undefined) {
			this.blobs.set(id, blob);
			this.events.emit("blobCreated", id, minTTLOverride);
		} else {
			this.events.emit("blobCreateFailed", id, error);
		}
	};

	public readonly waitCreateOne = async (createOptions?: BlobCreateOptions): Promise<void> => {
		assert(
			this._paused,
			"waitCreateOne is only available in paused mode to avoid conflicting with normal blob creation",
		);
		await this.waitBlobAvailable();
		this.createOne(createOptions);
	};

	public readonly createAll = (): void => {
		while (this.pendingBlobs.length > 0) {
			this.createOne();
		}
	};
}

export class MockStorageAdapter
	implements Pick<IContainerStorageService, "createBlob" | "readBlob">
{
	public readonly events = createEmitter<MockBlobStorageEvents>();
	public readonly detachedStorage = new MockBlobStorage(false);
	public readonly attachedStorage = new MockBlobStorage(true);

	public readonly pause = (): void => this.getCurrentStorage().pause();
	public readonly unpause = (): void => this.getCurrentStorage().unpause();

	public get blobsReceived(): number {
		return this.getCurrentStorage().blobsReceived;
	}

	public get blobsCreated(): number {
		return this.getCurrentStorage().blobsCreated;
	}

	public constructor(private attached: boolean) {
		if (attached) {
			this.attachedStorage.events.on("blobCreated", this.onBlobCreated);
			this.attachedStorage.events.on("blobCreateFailed", this.onBlobCreateFailed);
			this.attachedStorage.events.on("blobReceived", this.onBlobReceived);
		} else {
			this.detachedStorage.events.on("blobCreated", this.onBlobCreated);
			this.detachedStorage.events.on("blobCreateFailed", this.onBlobCreateFailed);
			this.detachedStorage.events.on("blobReceived", this.onBlobReceived);
		}
	}

	private readonly onBlobCreated = (id: string, minTTLOverride?: number | undefined) =>
		this.events.emit("blobCreated", id, minTTLOverride);
	private readonly onBlobCreateFailed = (id: string, error: Error) =>
		this.events.emit("blobCreateFailed", id, error);
	private readonly onBlobReceived = () => this.events.emit("blobReceived");

	public readonly simulateAttach = async (
		patchRedirectTable: BlobManager["patchRedirectTable"],
	): Promise<void> => {
		assert(!this.attached, "Can't simulate attach twice");
		// At least under current patterns, detached storage should always create blobs immediately.
		assert(
			this.detachedStorage.pendingBlobs.length === 0,
			"Detached storage has pending blobs",
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
		this.detachedStorage.events.off("blobCreated", this.onBlobCreated);
		this.detachedStorage.events.off("blobCreateFailed", this.onBlobCreateFailed);
		this.detachedStorage.events.off("blobReceived", this.onBlobReceived);
		this.attachedStorage.events.on("blobCreated", this.onBlobCreated);
		this.attachedStorage.events.on("blobCreateFailed", this.onBlobCreateFailed);
		this.attachedStorage.events.on("blobReceived", this.onBlobReceived);
	};

	private readonly getCurrentStorage = (): MockBlobStorage =>
		this.attached ? this.attachedStorage : this.detachedStorage;

	public readonly createBlob = async (
		blob: ArrayBufferLike,
	): Promise<ICreateBlobResponseWithTTL> => this.getCurrentStorage().createBlob(blob);

	public readBlob = async (id: string): Promise<ArrayBufferLike> =>
		this.getCurrentStorage().readBlob(id);

	public readonly waitBlobAvailable = async (): Promise<void> =>
		this.getCurrentStorage().waitBlobAvailable();

	public readonly createOne = (createOptions?: BlobCreateOptions): void =>
		this.getCurrentStorage().createOne(createOptions);

	public readonly waitCreateOne = async (createOptions?: BlobCreateOptions): Promise<void> =>
		this.getCurrentStorage().waitCreateOne(createOptions);
}

export interface UnprocessedMessage {
	clientId: string;
	metadata: IBlobMetadata;
}

interface MockOrderingServiceEvents {
	messageDropped: (message: UnprocessedMessage) => void;
	messageReceived: (message: UnprocessedMessage) => void;
	messageSequenced: (message: ISequencedMessageEnvelope) => void;
}

class MockOrderingService {
	public readonly unprocessedMessages: UnprocessedMessage[] = [];
	public readonly events = createEmitter<MockOrderingServiceEvents>();
	private _messagesReceived = 0;
	public get messagesReceived(): number {
		return this._messagesReceived;
	}
	private _messagesSequenced = 0;
	public get messagesSequenced(): number {
		return this._messagesSequenced;
	}

	private _paused: boolean = false;
	public pause = () => {
		this._paused = true;
	};

	public unpause = () => {
		this._paused = false;
		this.sequenceAll();
	};

	/**
	 * Waits until at least one message is available to be sequenced. This is useful to confirm
	 * the BlobManager is awaiting the attach message's ack.
	 */
	public readonly waitMessageAvailable = async (): Promise<void> => {
		if (this.unprocessedMessages.length === 0) {
			return new Promise<void>((resolve) => {
				const onMessageReceived = (message: UnprocessedMessage) => {
					resolve();
					this.events.off("messageReceived", onMessageReceived);
				};
				this.events.on("messageReceived", onMessageReceived);
			});
		}
	};

	public readonly sequenceOne = () => {
		const message = this.unprocessedMessages.shift();
		assert(message !== undefined, "Tried sequencing, but none to sequence");
		this._messagesSequenced++;
		// BlobManager only checks the metadata, so this cast is good enough.
		this.events.emit("messageSequenced", message as ISequencedMessageEnvelope);
	};

	public readonly waitSequenceOne = async () => {
		assert(
			this._paused,
			"waitSequenceOne is only available in paused mode to avoid conflicting with normal sequencing",
		);
		await this.waitMessageAvailable();
		this.sequenceOne();
	};

	// Sequence all unprocessed messages. The events emitted can be used to drive normal processing scenarios.
	public readonly sequenceAll = () => {
		while (this.unprocessedMessages.length > 0) {
			this.sequenceOne();
		}
	};

	public readonly dropOne = () => {
		const message = this.unprocessedMessages.shift();
		assert(message !== undefined, "Tried dropping, but none to drop");
		this.events.emit("messageDropped", message);
	};

	public readonly waitDropOne = async () => {
		assert(
			this._paused,
			"waitDropOne is only available in paused mode to avoid conflicting with normal sequencing",
		);
		await this.waitMessageAvailable();
		this.dropOne();
	};

	// Drop all unprocessed messages. The events emitted can be used to drive resubmit scenarios.
	public readonly dropAll = () => {
		// Only drop the current unprocessed messages, since this will trigger resubmit and we don't
		// necessarily want to drop those too.
		const numberToDrop = this.unprocessedMessages.length;
		for (let i = 0; i < numberToDrop; i++) {
			this.dropOne();
		}
	};

	public readonly sendBlobAttachMessage = (
		clientId: string,
		localId: string,
		remoteId: string,
	) => {
		const message: UnprocessedMessage = {
			clientId,
			metadata: { localId, blobId: remoteId },
		};
		this.unprocessedMessages.push(message);
		this._messagesReceived++;
		this.events.emit("messageReceived", message);
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
		sendBlobAttachMessage: (localId: string, storageId: string) =>
			mockOrderingService.sendBlobAttachMessage(clientId, localId, storageId),
		blobRequested: () => undefined,
		isBlobDeleted: mockGarbageCollector.isBlobDeleted,
		runtime: mockRuntime,
		pendingBlobs,
		createBlobPayloadPending,
	});

	mockOrderingService.events.on("messageSequenced", (message: ISequencedMessageEnvelope) => {
		blobManager.processBlobAttachMessage(message, message.clientId === clientId);
	});

	mockOrderingService.events.on("messageDropped", (message: UnprocessedMessage) => {
		if (message.clientId === clientId) {
			blobManager.reSubmit(message.metadata as unknown as Record<string, unknown>);
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
				// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
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
