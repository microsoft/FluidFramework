/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	bufferToString,
	gitHashFile,
	IsoBuffer,
	TypedEventEmitter,
} from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntimeEvents } from "@fluidframework/container-runtime-definitions/internal";
import type {
	IFluidHandle,
	IFluidHandleContext,
	IFluidHandleInternal,
} from "@fluidframework/core-interfaces/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import {
	type IClientDetails,
	type ICreateBlobResponse,
	SummaryType,
} from "@fluidframework/driver-definitions/internal";
import type {
	IRuntimeStorageService,
	ISequencedMessageEnvelope,
} from "@fluidframework/runtime-definitions/internal";
import {
	isFluidHandleInternalPayloadPending,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";
import {
	LoggingError,
	type MonitoringContext,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import {
	BlobManager,
	type IBlobManagerLoadInfo,
	type IBlobManagerRuntime,
	redirectTableBlobName,
	type IPendingBlobs,
} from "../../blobManager/index.js";

export const MIN_TTL = 24 * 60 * 60; // same as ODSP
export abstract class BaseMockBlobStorage
	implements Pick<IRuntimeStorageService, "readBlob" | "createBlob">
{
	public blobs: Map<string, ArrayBufferLike> = new Map();
	public abstract createBlob(blob: ArrayBufferLike): Promise<ICreateBlobResponse>;
	public async readBlob(id: string): Promise<ArrayBufferLike> {
		const blob = this.blobs.get(id);
		assert(!!blob);
		return blob;
	}
}

export class DedupeStorage extends BaseMockBlobStorage {
	public minTTL: number = MIN_TTL;

	public async createBlob(blob: ArrayBufferLike): Promise<ICreateBlobResponse> {
		const s = bufferToString(blob, "base64");
		const id = await gitHashFile(IsoBuffer.from(s, "base64"));
		this.blobs.set(id, blob);
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return { id, minTTLInSeconds: this.minTTL } as ICreateBlobResponse;
	}
}

export class NonDedupeStorage extends BaseMockBlobStorage {
	public async createBlob(blob: ArrayBufferLike): Promise<ICreateBlobResponse> {
		const id = this.blobs.size.toString();
		this.blobs.set(id, blob);
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return { id, minTTLInSeconds: MIN_TTL } as ICreateBlobResponse;
	}
}

export class MockRuntime
	extends TypedEventEmitter<IContainerRuntimeEvents>
	implements IBlobManagerRuntime
{
	public readonly clientDetails: IClientDetails = { capabilities: { interactive: true } };
	constructor(
		public mc: MonitoringContext,
		createBlobPayloadPending: boolean,
		blobManagerLoadInfo: IBlobManagerLoadInfo = {},
		attached = false,
		stashed: unknown[] = [[], {}],
	) {
		super();
		this.attachState = attached ? AttachState.Attached : AttachState.Detached;
		this.ops = stashed[0] as unknown[];
		this.baseLogger = mc.logger;
		this.blobManager = new BlobManager({
			routeContext: undefined as unknown as IFluidHandleContext,
			blobManagerLoadInfo,
			storage: this.getStorage(),
			sendBlobAttachOp: (localId: string, blobId?: string) =>
				this.sendBlobAttachOp(localId, blobId),
			blobRequested: () => undefined,
			isBlobDeleted: (blobPath: string) => this.isBlobDeleted(blobPath),
			runtime: this,
			stashedBlobs: stashed[1] as IPendingBlobs | undefined,
			createBlobPayloadPending,
		});
	}

	public disposed: boolean = false;

	public get storage(): IRuntimeStorageService {
		return (this.attachState === AttachState.Detached
			? this.detachedStorage
			: this.attachedStorage) as unknown as IRuntimeStorageService;
	}

	private processing = false;
	public unprocessedBlobs = new Set();

	public getStorage(): IRuntimeStorageService {
		return {
			createBlob: async (blob: ArrayBufferLike) => {
				if (this.processing) {
					return this.storage.createBlob(blob);
				}
				const P = this.processBlobsP.promise.then(async () => {
					if (!this.connected && this.attachState === AttachState.Attached) {
						this.unprocessedBlobs.delete(blob);
						throw new Error("fake error due to having no connection to storage service");
					} else {
						this.unprocessedBlobs.delete(blob);
						return this.storage.createBlob(blob);
					}
				});
				this.unprocessedBlobs.add(blob);
				this.emit("blob");
				this.blobPs.push(P);
				return P;
			},
			readBlob: async (id: string) => this.storage.readBlob(id),
		} as unknown as IRuntimeStorageService;
	}

	public sendBlobAttachOp(localId: string, blobId?: string): void {
		this.ops.push({ metadata: { localId, blobId } });
	}

	public async createBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandleInternal<ArrayBufferLike>> {
		const P = this.blobManager.createBlob(blob, signal);
		this.handlePs.push(P);
		return P;
	}

	public async getBlob(
		blobHandle: IFluidHandleInternal<ArrayBufferLike>,
	): Promise<ArrayBufferLike> {
		const pathParts = blobHandle.absolutePath.split("/");
		const blobId = pathParts[2];
		const payloadPending = isFluidHandleInternalPayloadPending(blobHandle)
			? blobHandle.payloadPending
			: false;
		return this.blobManager.getBlob(blobId, payloadPending);
	}

	public async getPendingLocalState(): Promise<(unknown[] | IPendingBlobs | undefined)[]> {
		const pendingBlobs = await this.blobManager.attachAndGetPendingBlobs();
		return [[...this.ops], pendingBlobs];
	}

	public blobManager: BlobManager;
	public connected = false;
	public closed = false;
	public attachState: AttachState;
	public attachedStorage = new DedupeStorage();
	public detachedStorage = new NonDedupeStorage();
	public baseLogger: ITelemetryLoggerExt;

	private ops: unknown[] = [];
	private processBlobsP = new Deferred<void>();
	private blobPs: Promise<unknown>[] = [];
	private handlePs: Promise<unknown>[] = [];
	private readonly deletedBlobs: string[] = [];

	public processOps(): void {
		assert(this.connected || this.ops.length === 0);
		for (const op of this.ops) {
			this.blobManager.processBlobAttachMessage(op as ISequencedMessageEnvelope, true);
		}
		this.ops = [];
	}

	public async processBlobs(
		resolve: boolean,
		canRetry: boolean = false,
		retryAfterSeconds?: number,
	): Promise<void> {
		const blobPs = this.blobPs;
		this.blobPs = [];
		if (resolve) {
			this.processBlobsP.resolve();
		} else {
			this.processBlobsP.reject(
				new LoggingError("fake driver error", { canRetry, retryAfterSeconds }),
			);
		}
		this.processBlobsP = new Deferred<void>();
		await Promise.allSettled(blobPs).catch(() => {});
	}

	public async processHandles(): Promise<void> {
		const handlePs = this.handlePs;
		this.handlePs = [];
		const handles = (await Promise.all(handlePs)) as IFluidHandleInternal<ArrayBufferLike>[];
		for (const handle of handles) {
			handle.attachGraph();
		}
	}

	public async processAll(): Promise<void> {
		while (this.blobPs.length + this.handlePs.length + this.ops.length > 0) {
			const p1 = this.processBlobs(true);
			const p2 = this.processHandles();
			this.processOps();
			await Promise.race([p1, p2]);
			this.processOps();
			await Promise.all([p1, p2]);
		}
	}

	public async attach(): Promise<IBlobManagerLoadInfo> {
		if (this.detachedStorage.blobs.size > 0) {
			const table = new Map<string, string>();
			for (const [detachedId, blob] of this.detachedStorage.blobs) {
				const { id } = await this.attachedStorage.createBlob(blob);
				table.set(detachedId, id);
			}
			this.detachedStorage.blobs.clear();
			this.blobManager.patchRedirectTable(table);
		}
		const summary = getSummaryContentsWithFormatValidation(this.blobManager);
		this.attachState = AttachState.Attached;
		this.emit("attached");
		return summary;
	}

	public async connect(delay = 0, processStashedWithRetry?: boolean): Promise<void> {
		assert(!this.connected);
		await new Promise<void>((resolve) => setTimeout(resolve, delay));
		this.connected = true;
		this.emit("connected", "client ID");
		await this.processStashed(processStashedWithRetry);
		const ops = this.ops;
		this.ops = [];
		for (const op of ops) {
			// TODO: better typing
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			this.blobManager.reSubmit((op as any).metadata as Record<string, unknown> | undefined);
		}
	}

	public async processStashed(processStashedWithRetry?: boolean): Promise<void> {
		// const uploadP = this.blobManager.stashedBlobsUploadP;
		this.processing = true;
		if (processStashedWithRetry === true) {
			await this.processBlobs(false, false, 0);
			// wait till next retry
			await new Promise<void>((resolve) => setTimeout(resolve, 1));
			// try again successfully
			await this.processBlobs(true);
		} else {
			await this.processBlobs(true);
		}
		// await uploadP;
		this.processing = false;
	}

	public disconnect(): void {
		assert(this.connected);
		this.connected = false;
		this.emit("disconnected");
	}

	public async remoteUpload(
		blob: ArrayBufferLike,
	): Promise<{ metadata: { localId: string; blobId: string } }> {
		const response = await this.storage.createBlob(blob);
		const op = { metadata: { localId: uuid(), blobId: response.id } };
		this.blobManager.processBlobAttachMessage(op as ISequencedMessageEnvelope, false);
		return op;
	}

	public deleteBlob(blobHandle: IFluidHandleInternal<ArrayBufferLike>): void {
		this.deletedBlobs.push(blobHandle.absolutePath);
	}

	public isBlobDeleted(blobPath: string): boolean {
		return this.deletedBlobs.includes(blobPath);
	}
}

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
