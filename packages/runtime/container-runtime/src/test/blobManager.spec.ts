/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";

import { Deferred } from "@fluidframework/core-utils";
import {
	bufferToString,
	gitHashFile,
	IsoBuffer,
	TypedEventEmitter,
} from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { IContainerRuntimeEvents } from "@fluidframework/container-runtime-definitions";
import {
	ConfigTypes,
	IConfigProviderBase,
	IErrorBase,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
	IClientDetails,
	ISequencedDocumentMessage,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import {
	mixinMonitoringContext,
	MonitoringContext,
	createChildLogger,
	LoggingError,
} from "@fluidframework/telemetry-utils";
import { BlobManager, IBlobManagerLoadInfo, IBlobManagerRuntime } from "../blobManager.js";

const MIN_TTL = 24 * 60 * 60; // same as ODSP
abstract class BaseMockBlobStorage
	implements Pick<IDocumentStorageService, "readBlob" | "createBlob">
{
	public blobs: Map<string, ArrayBufferLike> = new Map();
	public abstract createBlob(blob: ArrayBufferLike);
	public async readBlob(id: string) {
		const blob = this.blobs.get(id);
		assert(!!blob);
		return blob;
	}
}

class DedupeStorage extends BaseMockBlobStorage {
	public minTTL: number = MIN_TTL;

	public async createBlob(blob: ArrayBufferLike) {
		const s = bufferToString(blob, "base64");
		const id = await gitHashFile(IsoBuffer.from(s, "base64"));
		this.blobs.set(id, blob);
		return { id, minTTLInSeconds: this.minTTL };
	}
}

class NonDedupeStorage extends BaseMockBlobStorage {
	public async createBlob(blob: ArrayBufferLike) {
		const id = this.blobs.size.toString();
		this.blobs.set(id, blob);
		return { id, minTTLInSeconds: MIN_TTL };
	}
}

export class MockRuntime
	extends TypedEventEmitter<IContainerRuntimeEvents>
	implements IBlobManagerRuntime
{
	public readonly clientDetails: IClientDetails = { capabilities: { interactive: true } };
	constructor(
		public mc: MonitoringContext,
		snapshot: IBlobManagerLoadInfo = {},
		attached = false,
		stashed: any[] = [[], {}],
	) {
		super();
		this.attachState = attached ? AttachState.Attached : AttachState.Detached;
		this.ops = stashed[0];
		this.blobManager = new BlobManager(
			undefined as any, // routeContext
			snapshot,
			() => this.getStorage(),
			(localId: string, blobId?: string) => this.sendBlobAttachOp(localId, blobId),
			() => undefined,
			(blobPath: string) => this.isBlobDeleted(blobPath),
			this,
			stashed[1],
			() => (this.closed = true),
		);
	}

	public get storage() {
		return (this.attachState === AttachState.Detached
			? this.detachedStorage
			: this.attachedStorage) as unknown as IDocumentStorageService;
	}

	private processing = false;
	public unprocessedBlobs = new Set();

	public getStorage() {
		return {
			createBlob: async (blob) => {
				if (this.processing) {
					return this.storage.createBlob(blob);
				}
				const P = this.processBlobsP.promise.then(async () => {
					if (!this.connected && this.attachState === AttachState.Attached) {
						this.unprocessedBlobs.delete(blob);
						throw new Error(
							"fake error due to having no connection to storage service",
						);
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
			readBlob: async (id) => this.storage.readBlob(id),
		} as unknown as IDocumentStorageService;
	}

	public sendBlobAttachOp(localId: string, blobId?: string) {
		this.ops.push({ metadata: { localId, blobId } });
	}

	public async createBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandle<ArrayBufferLike>> {
		const P = this.blobManager.createBlob(blob, signal);
		this.handlePs.push(P);
		return P;
	}

	public async getBlob(blobHandle: IFluidHandle<ArrayBufferLike>) {
		const pathParts = blobHandle.absolutePath.split("/");
		const blobId = pathParts[2];
		return this.blobManager.getBlob(blobId);
	}

	public async getPendingLocalState() {
		const pendingBlobs = await this.blobManager.attachAndGetPendingBlobs();
		return [[...this.ops], pendingBlobs];
	}

	public blobManager: BlobManager;
	public connected = false;
	public closed = false;
	public attachState: AttachState;
	public attachedStorage = new DedupeStorage();
	public detachedStorage = new NonDedupeStorage();
	public logger = this.mc.logger;

	private ops: any[] = [];
	private processBlobsP = new Deferred<void>();
	private blobPs: Promise<any>[] = [];
	private handlePs: Promise<any>[] = [];
	private readonly deletedBlobs: string[] = [];

	public processOps() {
		assert(this.connected || this.ops.length === 0);
		this.ops.forEach((op) => this.blobManager.processBlobAttachOp(op, true));
		this.ops = [];
	}

	public async processBlobs(
		resolve: boolean,
		canRetry: boolean = false,
		retryAfterSeconds?: number,
	) {
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

	public async processHandles() {
		const handlePs = this.handlePs;
		this.handlePs = [];
		const handles: IFluidHandle<ArrayBufferLike>[] = await Promise.all(handlePs);
		handles.forEach((handle) => handle.attachGraph());
	}

	public async processAll() {
		while (this.blobPs.length + this.handlePs.length + this.ops.length > 0) {
			const p1 = this.processBlobs(true);
			const p2 = this.processHandles();
			this.processOps();
			await Promise.race([p1, p2]);
			this.processOps();
			await Promise.all([p1, p2]);
		}
	}

	public async attach() {
		if (this.detachedStorage.blobs.size > 0) {
			const table = new Map();
			for (const [detachedId, blob] of this.detachedStorage.blobs) {
				const { id } = await this.attachedStorage.createBlob(blob);
				table.set(detachedId, id);
			}
			this.detachedStorage.blobs.clear();
			this.blobManager.setRedirectTable(table);
		}
		const summary = validateSummary(this);
		this.attachState = AttachState.Attached;
		this.emit("attached");
		return summary;
	}

	public async connect(delay = 0, processStashedWithRetry?: boolean) {
		assert(!this.connected);
		await new Promise<void>((resolve) => setTimeout(resolve, delay));
		this.connected = true;
		this.emit("connected", "client ID");
		await this.processStashed(processStashedWithRetry);
		const ops = this.ops;
		this.ops = [];
		ops.forEach((op) => this.blobManager.reSubmit(op.metadata));
	}

	public async processStashed(processStashedWithRetry?: boolean) {
		const uploadP = this.blobManager.processStashedChanges();
		this.processing = true;
		if (processStashedWithRetry) {
			await this.processBlobs(false, false, 0);
			// wait till next retry
			await new Promise<void>((resolve) => setTimeout(resolve, 1));
			// try again successfully
			await this.processBlobs(true);
		} else {
			await this.processBlobs(true);
		}
		await uploadP;
		this.processing = false;
	}

	public disconnect() {
		assert(this.connected);
		this.connected = false;
		this.emit("disconnected");
	}

	public async remoteUpload(blob: ArrayBufferLike) {
		const response = await this.storage.createBlob(blob);
		const op = { metadata: { localId: uuid(), blobId: response.id } };
		this.blobManager.processBlobAttachOp(op as ISequencedDocumentMessage, false);
		return op;
	}

	public deleteBlob(blobHandle: IFluidHandle<ArrayBufferLike>) {
		this.deletedBlobs.push(blobHandle.absolutePath);
	}

	public isBlobDeleted(blobPath: string): boolean {
		return this.deletedBlobs.includes(blobPath);
	}
}

export const validateSummary = (runtime: MockRuntime) => {
	const summary = runtime.blobManager.summarize();
	const ids: any[] = [];
	let redirectTable;
	for (const [key, attachment] of Object.entries(summary.summary.tree)) {
		if (attachment.type === SummaryType.Attachment) {
			ids.push(attachment.id);
		} else {
			assert.strictEqual(key, (BlobManager as any).redirectTableBlobName);
			assert(attachment.type === SummaryType.Blob);
			assert(typeof attachment.content === "string");
			redirectTable = new Map(JSON.parse(attachment.content));
		}
	}
	return { ids, redirectTable };
};

describe("BlobManager", () => {
	const handlePs: Promise<IFluidHandle<ArrayBufferLike>>[] = [];
	let runtime: MockRuntime;
	let createBlob: (blob: ArrayBufferLike, signal?: AbortSignal) => Promise<void>;
	let waitForBlob: (blob: ArrayBufferLike) => Promise<void>;
	let mc: MonitoringContext;
	let injectedSettings: Record<string, ConfigTypes> = {};

	beforeEach(() => {
		const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
			getRawConfig: (name: string): ConfigTypes => settings[name],
		});
		mc = mixinMonitoringContext(createChildLogger(), configProvider(injectedSettings));
		runtime = new MockRuntime(mc);
		handlePs.length = 0;

		// ensures this blob will be processed next time runtime.processBlobs() is called
		waitForBlob = async (blob) => {
			if (!runtime.unprocessedBlobs.has(blob)) {
				await new Promise<void>((resolve) =>
					runtime.on("blob", () => {
						if (!runtime.unprocessedBlobs.has(blob)) {
							resolve();
						}
					}),
				);
			}
		};

		// create blob and await the handle after the test
		createBlob = async (blob: ArrayBufferLike, signal?: AbortSignal) => {
			const handleP = runtime.createBlob(blob, signal);
			handlePs.push(handleP);
			await waitForBlob(blob);
		};

		const onNoPendingBlobs = () => {
			assert((runtime.blobManager as any).pendingBlobs.size === 0);
		};

		runtime.blobManager.on("noPendingBlobs", () => onNoPendingBlobs());
	});

	afterEach(async () => {
		assert((runtime.blobManager as any).pendingBlobs.size === 0);
		injectedSettings = {};
	});

	it("empty snapshot", () => {
		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);
	});

	it("non empty snapshot", async () => {
		await runtime.attach();
		await runtime.connect();

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 1);
	});

	it("hasPendingBlobs", async () => {
		await runtime.attach();
		await runtime.connect();

		assert.strictEqual(runtime.blobManager.hasPendingBlobs, false);
		await createBlob(IsoBuffer.from("blob", "utf8"));
		await createBlob(IsoBuffer.from("blob2", "utf8"));
		assert.strictEqual(runtime.blobManager.hasPendingBlobs, true);
		await runtime.processAll();
		assert.strictEqual(runtime.blobManager.hasPendingBlobs, false);
		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 2);
		assert.strictEqual(summaryData.redirectTable.size, 2);
	});

	it("NoPendingBlobs count", async () => {
		await runtime.attach();
		await runtime.connect();
		let count = 0;
		runtime.blobManager.on("noPendingBlobs", () => count++);

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();
		assert.strictEqual(count, 1);
		await createBlob(IsoBuffer.from("blob2", "utf8"));
		await createBlob(IsoBuffer.from("blob3", "utf8"));
		await runtime.processAll();
		assert.strictEqual(count, 2);
		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 3);
		assert.strictEqual(summaryData.redirectTable.size, 3);
	});

	it("detached snapshot", async () => {
		assert.strictEqual(runtime.blobManager.hasPendingBlobs, false);
		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();
		assert.strictEqual(runtime.blobManager.hasPendingBlobs, true);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable, undefined);
	});

	it("detached->attached snapshot", async () => {
		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();
		assert.strictEqual(runtime.blobManager.hasPendingBlobs, true);
		await runtime.attach();
		assert.strictEqual(runtime.blobManager.hasPendingBlobs, false);
		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 1);
	});

	it("uploads while disconnected", async () => {
		await runtime.attach();
		const handleP = runtime.createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.connect();
		await runtime.processAll();
		await assert.doesNotReject(handleP);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 1);
	});

	it("close container if blob expired", async () => {
		await runtime.attach();
		await runtime.connect();
		runtime.attachedStorage.minTTL = 0.001; // force expired TTL being less than connection time (50ms)
		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processBlobs(true);
		runtime.disconnect();
		await new Promise<void>((resolve) => setTimeout(resolve, 50));
		await runtime.connect();
		assert.strictEqual(runtime.closed, true);
		await runtime.processAll();
	});

	it("completes after disconnection while upload pending", async () => {
		await runtime.attach();
		await runtime.connect();

		const handleP = runtime.createBlob(IsoBuffer.from("blob", "utf8"));
		runtime.disconnect();
		await runtime.connect(10); // adding some delay to reconnection
		await runtime.processAll();
		await assert.doesNotReject(handleP);

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 1);
	});

	it("upload fails gracefully", async () => {
		await runtime.attach();
		await runtime.connect();

		const handleP = runtime.createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processBlobs(false);
		runtime.processOps();
		try {
			await handleP;
			assert.fail("should fail");
		} catch (error: any) {
			assert.strictEqual(error.message, "fake driver error");
		}
		await assert.rejects(handleP);
		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 0);
		assert.strictEqual(summaryData.redirectTable, undefined);
	});

	it.skip("upload fails and retries for retriable errors", async () => {
		// Needs to use some sort of fake timer or write test in a different way as it is waiting
		// for actual time which is causing timeouts.
		await runtime.attach();
		await runtime.connect();
		const handleP = runtime.createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processBlobs(false, true, 0);
		// wait till next retry
		await new Promise<void>((resolve) => setTimeout(resolve, 1));
		// try again successfully
		await runtime.processBlobs(true);
		runtime.processOps();
		await runtime.processHandles();
		assert(handleP);
		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 1);
	});

	it("completes after disconnection while op in flight", async () => {
		await runtime.attach();
		await runtime.connect();

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processBlobs(true);

		runtime.disconnect();
		await runtime.connect();
		await runtime.processAll();

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 2);
	});

	it("multiple disconnect/connects", async () => {
		await runtime.attach();
		await runtime.connect();

		const blob = IsoBuffer.from("blob", "utf8");
		const handleP = runtime.createBlob(blob);
		runtime.disconnect();
		await runtime.connect(10);

		const blob2 = IsoBuffer.from("blob2", "utf8");
		const handleP2 = runtime.createBlob(blob2);
		runtime.disconnect();

		await runtime.connect(10);
		await runtime.processAll();
		await assert.doesNotReject(handleP);
		await assert.doesNotReject(handleP2);
		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 2);
		assert.strictEqual(summaryData.redirectTable.size, 2);
	});

	it("handles deduped IDs", async () => {
		await runtime.attach();
		await runtime.connect();

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await createBlob(IsoBuffer.from("blob", "utf8"));
		runtime.disconnect();
		await runtime.connect();

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processBlobs(true);

		runtime.disconnect();
		await runtime.connect();

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 6);
	});

	it("handles deduped IDs in detached", async () => {
		runtime.detachedStorage = new DedupeStorage();

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable, undefined);
	});

	it("handles deduped IDs in detached->attached", async () => {
		runtime.detachedStorage = new DedupeStorage();

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();

		await runtime.attach();
		await runtime.connect();
		await createBlob(IsoBuffer.from("blob", "utf8"));
		await createBlob(IsoBuffer.from("blob", "utf8"));

		runtime.disconnect();
		await runtime.connect();

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await createBlob(IsoBuffer.from("blob", "utf8"));

		await runtime.processAll();

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 4);
	});

	it("can load from summary", async () => {
		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();

		await runtime.attach();
		const handle = runtime.createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.connect();

		await runtime.processAll();
		await assert.doesNotReject(handle);

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 3);

		const runtime2 = new MockRuntime(mc, summaryData, true);
		const summaryData2 = validateSummary(runtime2);
		assert.strictEqual(summaryData2.ids.length, 1);
		assert.strictEqual(summaryData2.redirectTable.size, 3);
	});

	it("handles duplicate remote upload", async () => {
		await runtime.attach();
		await runtime.connect();

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.remoteUpload(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 2);
	});

	it("handles duplicate remote upload between upload and op", async () => {
		await runtime.attach();
		await runtime.connect();

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.processBlobs(true);
		await runtime.remoteUpload(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 2);
	});

	it("handles duplicate remote upload with local ID", async () => {
		await runtime.attach();

		await createBlob(IsoBuffer.from("blob", "utf8"));
		await runtime.connect();
		await runtime.processBlobs(true);
		await runtime.remoteUpload(IsoBuffer.from("blob", "utf8"));
		await runtime.processAll();

		const summaryData = validateSummary(runtime);
		assert.strictEqual(summaryData.ids.length, 1);
		assert.strictEqual(summaryData.redirectTable.size, 2);
	});

	it("includes blob IDs in summary while attaching", async () => {
		await createBlob(IsoBuffer.from("blob1", "utf8"));
		await createBlob(IsoBuffer.from("blob2", "utf8"));
		await createBlob(IsoBuffer.from("blob3", "utf8"));
		await runtime.processAll();

		// While attaching with blobs, Container takes a summary while still in "Detached"
		// state. BlobManager should know to include the list of attached blob
		// IDs since this summary will be used to create the document
		const summaryData = await runtime.attach();
		assert.strictEqual(summaryData?.ids.length, 3);
		assert.strictEqual(summaryData?.redirectTable.size, 3);
	});

	it("all blobs attached", async () => {
		await runtime.attach();
		await runtime.connect();
		assert.strictEqual(runtime.blobManager.allBlobsAttached, true);
		await createBlob(IsoBuffer.from("blob1", "utf8"));
		assert.strictEqual(runtime.blobManager.allBlobsAttached, false);
		await runtime.processBlobs(true);
		assert.strictEqual(runtime.blobManager.allBlobsAttached, false);
		await runtime.processAll();
		assert.strictEqual(runtime.blobManager.allBlobsAttached, true);
		await createBlob(IsoBuffer.from("blob1", "utf8"));
		await createBlob(IsoBuffer.from("blob2", "utf8"));
		await createBlob(IsoBuffer.from("blob3", "utf8"));
		assert.strictEqual(runtime.blobManager.allBlobsAttached, false);
		await runtime.processAll();
		assert.strictEqual(runtime.blobManager.allBlobsAttached, true);
	});

	describe("Abort Signal", () => {
		it("abort before upload", async () => {
			await runtime.attach();
			await runtime.connect();
			const ac = new AbortController();
			ac.abort("abort test");
			try {
				const blob = IsoBuffer.from("blob", "utf8");
				await runtime.createBlob(blob, ac.signal);
				assert.fail("Should not succeed");
			} catch (error: any) {
				assert.strictEqual(error.status, undefined);
				assert.strictEqual(error.uploadTime, undefined);
				assert.strictEqual(error.acked, undefined);
				assert.strictEqual(error.message, "uploadBlob aborted");
			}
			const summaryData = validateSummary(runtime);
			assert.strictEqual(summaryData.ids.length, 0);
			assert.strictEqual(summaryData.redirectTable, undefined);
		});

		it("abort while upload", async () => {
			await runtime.attach();
			await runtime.connect();
			const ac = new AbortController();
			const blob = IsoBuffer.from("blob", "utf8");
			const handleP = runtime.createBlob(blob, ac.signal);
			ac.abort("abort test");
			assert.strictEqual(runtime.unprocessedBlobs.size, 1);
			await runtime.processBlobs(true);
			try {
				await handleP;
				assert.fail("Should not succeed");
			} catch (error: any) {
				assert.strictEqual(error.uploadTime, undefined);
				assert.strictEqual(error.acked, false);
				assert.strictEqual(error.message, "uploadBlob aborted");
			}
			assert(handleP);
			await assert.rejects(handleP);
			const summaryData = validateSummary(runtime);
			assert.strictEqual(summaryData.ids.length, 0);
			assert.strictEqual(summaryData.redirectTable, undefined);
		});

		it("abort while failed upload", async () => {
			await runtime.attach();
			await runtime.connect();
			const ac = new AbortController();
			const blob = IsoBuffer.from("blob", "utf8");
			const handleP = runtime.createBlob(blob, ac.signal);
			const handleP2 = runtime.createBlob(IsoBuffer.from("blob2", "utf8"));
			ac.abort("abort test");
			assert.strictEqual(runtime.unprocessedBlobs.size, 2);
			await runtime.processBlobs(false);
			try {
				await handleP;
				assert.fail("Should not succeed");
			} catch (error: any) {
				assert.strictEqual(error.message, "uploadBlob aborted");
			}
			try {
				await handleP2;
				assert.fail("Should not succeed");
			} catch (error: any) {
				assert.strictEqual(error.message, "fake driver error");
			}
			await assert.rejects(handleP);
			await assert.rejects(handleP2);
			const summaryData = validateSummary(runtime);
			assert.strictEqual(summaryData.ids.length, 0);
			assert.strictEqual(summaryData.redirectTable, undefined);
		});

		it("abort while disconnected", async () => {
			await runtime.attach();
			await runtime.connect();
			const ac = new AbortController();
			const blob = IsoBuffer.from("blob", "utf8");
			const handleP = runtime.createBlob(blob, ac.signal);
			runtime.disconnect();
			ac.abort();
			await runtime.processBlobs(true);
			try {
				await handleP;
				assert.fail("Should not succeed");
			} catch (error: any) {
				assert.strictEqual(error.message, "uploadBlob aborted");
			}
			await assert.rejects(handleP);
			const summaryData = validateSummary(runtime);
			assert.strictEqual(summaryData.ids.length, 0);
			assert.strictEqual(summaryData.redirectTable, undefined);
		});

		it("abort after blob suceeds", async () => {
			await runtime.attach();
			await runtime.connect();
			const ac = new AbortController();
			let handleP;
			try {
				const blob = IsoBuffer.from("blob", "utf8");
				handleP = runtime.createBlob(blob, ac.signal);
				await runtime.processAll();
				ac.abort();
			} catch (error: any) {
				assert.fail("abort after processing should not throw");
			}
			assert(handleP);
			await assert.doesNotReject(handleP);
			const summaryData = validateSummary(runtime);
			assert.strictEqual(summaryData.ids.length, 1);
			assert.strictEqual(summaryData.redirectTable.size, 1);
		});

		it("abort while waiting for op", async () => {
			await runtime.attach();
			await runtime.connect();
			const ac = new AbortController();
			const blob = IsoBuffer.from("blob", "utf8");
			const handleP = runtime.createBlob(blob, ac.signal);
			const p1 = runtime.processBlobs(true);
			const p2 = runtime.processHandles();
			// finish upload
			await Promise.race([p1, p2]);
			ac.abort();
			runtime.processOps();
			try {
				// finish op
				await handleP;
				assert.fail("Should not succeed");
			} catch (error: any) {
				assert.strictEqual(error.message, "uploadBlob aborted");
				assert.ok(error.uploadTime);
				assert.strictEqual(error.acked, false);
			}
			await assert.rejects(handleP);
			const summaryData = validateSummary(runtime);
			assert.strictEqual(summaryData.ids.length, 0);
			assert.strictEqual(summaryData.redirectTable, undefined);
		});

		it("resubmit on aborted pending op", async () => {
			await runtime.attach();
			await runtime.connect();
			const ac = new AbortController();
			let handleP;
			try {
				handleP = runtime.createBlob(IsoBuffer.from("blob", "utf8"), ac.signal);
				const p1 = runtime.processBlobs(true);
				const p2 = runtime.processHandles();
				// finish upload
				await Promise.race([p1, p2]);
				runtime.disconnect();
				ac.abort();
				await handleP;
				assert.fail("Should not succeed");
			} catch (error: any) {
				assert.strictEqual(error.message, "uploadBlob aborted");
				assert.ok(error.uploadTime);
				assert.strictEqual(error.acked, false);
			}
			await runtime.connect();
			runtime.processOps();
			await assert.rejects(handleP);
			const summaryData = validateSummary(runtime);
			assert.strictEqual(summaryData.ids.length, 0);
			assert.strictEqual(summaryData.redirectTable, undefined);
		});
	});

	describe("Garbage Collection", () => {
		let redirectTable: Map<string, string | undefined>;

		/** Creates a blob with the given content and returns its local and storage id. */
		async function createBlobAndGetIds(content: string) {
			// For a given blob's GC node id, returns the blob id.
			const getBlobIdFromGCNodeId = (gcNodeId: string) => {
				const pathParts = gcNodeId.split("/");
				assert(
					pathParts.length === 3 && pathParts[1] === BlobManager.basePath,
					"Invalid blob node path",
				);
				return pathParts[2];
			};

			// For a given blob's id, returns the GC node id.
			const getGCNodeIdFromBlobId = (blobId: string) => {
				return `/${BlobManager.basePath}/${blobId}`;
			};

			const blobContents = IsoBuffer.from(content, "utf8");
			const handleP = runtime.createBlob(blobContents);
			await runtime.processAll();

			const blobHandle = await handleP;
			const localId = getBlobIdFromGCNodeId(blobHandle.absolutePath);
			assert(redirectTable.has(localId), "blob not found in redirect table");
			const storageId = redirectTable.get(localId);
			assert(storageId !== undefined, "storage id not found in redirect table");
			return {
				localId,
				localGCNodeId: getGCNodeIdFromBlobId(localId),
				storageId,
				storageGCNodeId: getGCNodeIdFromBlobId(storageId),
			};
		}

		beforeEach(() => {
			redirectTable = (runtime.blobManager as any).redirectTable;
		});

		it("fetching deleted blob fails", async () => {
			await runtime.attach();
			await runtime.connect();
			const blob1Contents = IsoBuffer.from("blob1", "utf8");
			const blob2Contents = IsoBuffer.from("blob2", "utf8");
			const handle1P = runtime.createBlob(blob1Contents);
			const handle2P = runtime.createBlob(blob2Contents);
			await runtime.processAll();

			const blob1Handle = await handle1P;
			const blob2Handle = await handle2P;

			// Validate that the blobs can be retrieved.
			assert.strictEqual(await runtime.getBlob(blob1Handle), blob1Contents);
			assert.strictEqual(await runtime.getBlob(blob2Handle), blob2Contents);

			// Delete blob1. Retrieving it should result in an error.
			runtime.deleteBlob(blob1Handle);
			await assert.rejects(
				async () => runtime.getBlob(blob1Handle),
				(error: IErrorBase & { code: number | undefined }) => {
					const blob1Id = blob1Handle.absolutePath.split("/")[2];
					const correctErrorType = error.code === 404;
					const correctErrorMessage = error.message === `Blob was deleted: ${blob1Id}`;
					return correctErrorType && correctErrorMessage;
				},
				"Deleted blob2 fetch should have failed",
			);

			// Delete blob2. Retrieving it should result in an error.
			runtime.deleteBlob(blob2Handle);
			await assert.rejects(
				async () => runtime.getBlob(blob2Handle),
				(error: IErrorBase & { code: number | undefined }) => {
					const blob2Id = blob2Handle.absolutePath.split("/")[2];
					const correctErrorType = error.code === 404;
					const correctErrorMessage = error.message === `Blob was deleted: ${blob2Id}`;
					return correctErrorType && correctErrorMessage;
				},
				"Deleted blob2 fetch should have failed",
			);
		});

		// Support for this config has been removed.
		const legacyKey_disableAttachmentBlobSweep =
			"Fluid.GarbageCollection.DisableAttachmentBlobSweep";
		[true, undefined].forEach((disableAttachmentBlobsSweep) =>
			it(`deletes unused blobs regardless of DisableAttachmentBlobsSweep setting [DisableAttachmentBlobsSweep=${disableAttachmentBlobsSweep}]`, async () => {
				injectedSettings[legacyKey_disableAttachmentBlobSweep] =
					disableAttachmentBlobsSweep;

				await runtime.attach();
				await runtime.connect();

				const blob1 = await createBlobAndGetIds("blob1");
				const blob2 = await createBlobAndGetIds("blob2");

				// Delete blob1's local id. The local id and the storage id should both be deleted from the redirect table
				// since the blob only had one reference.
				runtime.blobManager.deleteSweepReadyNodes([blob1.localGCNodeId]);
				assert(!redirectTable.has(blob1.localId));
				assert(!redirectTable.has(blob1.storageId));

				// Delete blob2's local id. The local id and the storage id should both be deleted from the redirect table
				// since the blob only had one reference.
				runtime.blobManager.deleteSweepReadyNodes([blob2.localGCNodeId]);
				assert(!redirectTable.has(blob2.localId));
				assert(!redirectTable.has(blob2.storageId));
			}),
		);

		it("deletes unused de-duped blobs", async () => {
			await runtime.attach();
			await runtime.connect();

			// Create 2 blobs with the same content. They should get de-duped.
			const blob1 = await createBlobAndGetIds("blob1");
			const blob1Duplicate = await createBlobAndGetIds("blob1");
			assert(blob1.storageId === blob1Duplicate.storageId, "blob1 not de-duped");

			// Create another 2 blobs with the same content. They should get de-duped.
			const blob2 = await createBlobAndGetIds("blob2");
			const blob2Duplicate = await createBlobAndGetIds("blob2");
			assert(blob2.storageId === blob2Duplicate.storageId, "blob2 not de-duped");

			// Delete blob1's local id. The local id should both be deleted from the redirect table but the storage id
			// should not because the blob has another referenced from the de-duped blob.
			runtime.blobManager.deleteSweepReadyNodes([blob1.localGCNodeId]);
			assert(!redirectTable.has(blob1.localId), "blob1 localId should have been deleted");
			assert(
				redirectTable.has(blob1.storageId),
				"blob1 storageId should not have been deleted",
			);
			// Delete blob1's de-duped local id. The local id and the storage id should both be deleted from the redirect table
			// since all the references for the blob are now deleted.
			runtime.blobManager.deleteSweepReadyNodes([blob1Duplicate.localGCNodeId]);
			assert(
				!redirectTable.has(blob1Duplicate.localId),
				"blob1Duplicate localId should have been deleted",
			);
			assert(!redirectTable.has(blob1.storageId), "blob1 storageId should have been deleted");

			// Delete blob2's local id. The local id should both be deleted from the redirect table but the storage id
			// should not because the blob has another referenced from the de-duped blob.
			runtime.blobManager.deleteSweepReadyNodes([blob2.localGCNodeId]);
			assert(!redirectTable.has(blob2.localId), "blob2 localId should have been deleted");
			assert(
				redirectTable.has(blob2.storageId),
				"blob2 storageId should not have been deleted",
			);
			// Delete blob2's de-duped local id. The local id and the storage id should both be deleted from the redirect table
			// since all the references for the blob are now deleted.
			runtime.blobManager.deleteSweepReadyNodes([blob2Duplicate.localGCNodeId]);
			assert(
				!redirectTable.has(blob2Duplicate.localId),
				"blob2Duplicate localId should have been deleted",
			);
			assert(!redirectTable.has(blob2.storageId), "blob2 storageId should have been deleted");
		});
	});
});
