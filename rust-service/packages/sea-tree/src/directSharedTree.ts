/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createDirectSharedTree,
	ForestTypeOptimized,
	type SharedTreeKernelView,
} from "@fluidframework/tree/internal";
import {
	createIdCompressor,
	createSessionId,
	deserializeIdCompressor,
	serializeIdCompressor,
	type IIdCompressor,
	type IdCreationRange,
	type SerializedIdCompressorWithNoSession,
	toIdCompressorWithCore,
} from "@fluidframework/id-compressor/internal";
import {
	SeaDocumentStorage,
	type ProjectedOperation,
	type ProjectedOperationSubscription,
	type ProjectedReadPage,
	type SeaDriverClient,
} from "@fluidframework/sea-driver/internal";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const metadataPath = ".sea-direct";

/** Scheduling policy for the runtime-free host. @internal */
export interface DirectSharedTreeClientOptions {
	/** Maximum applied application operations between summaries. Defaults to 100. */
	readonly summaryMaxOperations?: number;
	/** Idle delay before summarizing dirty state, in milliseconds. Defaults to 5,000. */
	readonly summaryIdleMs?: number;
}

/** Observable transport lifecycle of a direct host. @internal */
export type DirectSharedTreeConnectionState =
	| "connected"
	| "disconnected"
	| "reconnecting"
	| "error"
	| "disposed";

/** Encoded application message, independent of its SEA author incarnation. */
interface DirectSharedTreePayload {
	/** SharedTree message, re-encoded by the kernel on resubmission. */
	readonly contents: unknown;
	/** Compressor ranges ordered with this message. */
	readonly idCreationRange: IdCreationRange;
	/** Host-local attempt identity retained in canonical history. */
	readonly clientSequenceNumber: number;
}

/** Local edit retained until its canonical acknowledgment is applied. */
interface PendingMessage {
	/** Encoded message and compressor allocation. */
	readonly payload: DirectSharedTreePayload;
	/** Kernel-owned schema context required to re-encode a rebased edit. */
	readonly metadata: unknown;
	/** Canonical reference captured when the message was encoded. */
	readonly reference: Uint8Array | undefined;
	/** Author that attempted this message; absent until dispatch. */
	session?: Uint8Array;
}

/** Snapshot state needed in addition to SharedTree's own summary. */
interface SnapshotMetadata {
	/** Format discriminator; incompatible versions are rejected. */
	readonly version: 1;
	/** Last canonical projection sequence represented by the summary. */
	readonly sequenceNumber: number;
	/** Position-to-sequence mapping for references retained by the tree. */
	readonly positions: readonly (readonly [string, number])[];
	/** Finalized compressor state; never includes unacknowledged allocations. */
	readonly compressor: SerializedIdCompressorWithNoSession;
}

/**
 * Runtime-free SEA host with snapshots and in-memory pending-edit recovery.
 * @internal
 */
export class DirectSharedTreeClient {
	/** Production tree and stable application views, retained across reconnects. */
	public readonly tree: SharedTreeKernelView;
	/** Number of application batches delivered to the kernel. */
	public deliveredBatchCount = 0;
	/** Largest application batch delivered to the kernel. */
	public peakDeliveredBatchOperations = 0;
	/** Highest canonical sequence applied, including membership records. */
	public lastAppliedSequenceNumber = 0;
	/** Highest sequence represented by a known published summary. */
	public lastSummarySequenceNumber = 0;
	/** Number of snapshots successfully published by this host. */
	public summaryCount = 0;
	/** Whether initial tree state was loaded from a summary. */
	public loadedFromSummary = false;
	/** Current connection state; local edits are retained during an outage. */
	public get connectionState(): DirectSharedTreeConnectionState {
		return this.state;
	}
	/** Latest connection, summary, or terminal error, exposed to the UI. */
	public lastError: unknown;
	/** Backend-assigned document identity. */
	public readonly documentId: Uint8Array;

	/** Number of local edits awaiting canonical acknowledgment. */
	public get pendingOperationCount(): number {
		return this.pending.length;
	}

	/** Mutable lifecycle is private so observers cannot bypass transport fencing. */
	private state: DirectSharedTreeConnectionState = "connected";
	/** Current SEA author, distinct from the stable compressor session. */
	private session: Uint8Array;
	private readonly localSessions = new Set<string>();
	private readonly terminalSessions = new Set<string>();
	private readonly positions = new Map<string, number>();
	private readonly pending: PendingMessage[] = [];
	private readonly listeners = new Set<() => void>();
	private subscription: ProjectedOperationSubscription | undefined;
	private subscriptionPump: Promise<void> | undefined;
	private sending: Promise<void> | undefined;
	private recovery: Promise<void> | undefined;
	/** Coalesces a new transport failure while the previous recovery is finishing. */
	private recoveryRequested = false;
	private summarizing: Promise<void> | undefined;
	private summaryTimer: ReturnType<typeof setTimeout> | undefined;
	private cursor: Uint8Array | undefined;
	private localSequenceNumber = 0;
	private dirtyOperations = 0;
	private generation = 0;
	private readonly summaryMaxOperations: number;
	private readonly summaryIdleMs: number;

	private constructor(
		private readonly client: SeaDriverClient,
		document: Uint8Array,
		private readonly compressor: IIdCompressor,
		private readonly batchMaxOperations: number,
		private readonly batchMaxPayloadBytes: number,
		options: DirectSharedTreeClientOptions,
		metadata?: SnapshotMetadata,
	) {
		this.documentId = document;
		this.session = client.sessionId ?? encoder.encode(compressor.localSessionId);
		this.localSessions.add(byteKey(this.session));
		this.summaryMaxOperations = options.summaryMaxOperations ?? 100;
		this.summaryIdleMs = options.summaryIdleMs ?? 5_000;
		if (metadata !== undefined) {
			this.lastAppliedSequenceNumber = metadata.sequenceNumber;
			this.lastSummarySequenceNumber = metadata.sequenceNumber;
			for (const [position, sequence] of metadata.positions)
				this.positions.set(position, sequence);
		}
		this.tree = createDirectSharedTree({
			forest: ForestTypeOptimized,
			idCompressor: compressor,
			lastSequenceNumber: () => this.lastAppliedSequenceNumber,
			submitLocalMessage: (contents, localOpMetadata) => {
				this.pending.push({
					payload: {
						contents,
						idCreationRange: toIdCompressorWithCore(compressor).takeNextCreationRange(),
						clientSequenceNumber: ++this.localSequenceNumber,
					},
					metadata: localOpMetadata,
					reference: this.cursor?.slice(),
				});
				this.notify();
				this.sendPending();
			},
		});
	}

	/** Opens a document, loads its latest summary, and catches up before returning. */
	public static async create(
		client: SeaDriverClient,
		document: Uint8Array,
		batchMaxOperations: number,
		batchMaxPayloadBytes: number,
		createDocument: boolean,
		options: DirectSharedTreeClientOptions = {},
	): Promise<DirectSharedTreeClient> {
		for (const value of [
			batchMaxOperations,
			batchMaxPayloadBytes,
			options.summaryMaxOperations ?? 100,
			options.summaryIdleMs ?? 5_000,
		]) {
			if (!Number.isSafeInteger(value) || value <= 0) {
				throw new RangeError("Direct SharedTree limits must be positive safe integers");
			}
		}
		let host: DirectSharedTreeClient | undefined;
		try {
			const documentId = createDocument ? await client.create() : document;
			await client.openSession(documentId, encoder.encode(createSessionId()));
			await client.announceMembership?.(encoder.encode(JSON.stringify({ mode: "write" })));
			const snapshot = await client.latestSnapshot();
			const entries = snapshot === undefined ? [] : await client.fetchSummary(snapshot.root);
			const blobs = new Map(entries.map((entry) => [decoder.decode(entry.path), entry.blob]));
			let metadata: SnapshotMetadata | undefined;
			if (snapshot !== undefined) {
				const metadataBlob = blobs.get(metadataPath);
				if (metadataBlob === undefined || snapshot.atEvent === undefined) {
					throw new Error("Snapshot is not a direct SharedTree summary");
				}
				metadata = JSON.parse(
					decoder.decode(await client.fetchBlob(metadataBlob)),
				) as SnapshotMetadata;
				if (
					metadata.version !== 1 ||
					!Number.isSafeInteger(metadata.sequenceNumber) ||
					metadata.sequenceNumber < 0 ||
					!Array.isArray(metadata.positions)
				) {
					throw new Error("Invalid direct SharedTree summary metadata");
				}
			}
			const compressor =
				metadata === undefined
					? createIdCompressor()
					: deserializeIdCompressor(metadata.compressor, createSessionId());
			host = new DirectSharedTreeClient(
				client,
				documentId,
				compressor,
				batchMaxOperations,
				batchMaxPayloadBytes,
				options,
				metadata,
			);
			if (snapshot !== undefined) {
				await host.tree.kernel.loadCore({
					getSnapshotTree: () => undefined,
					readBlob: async (path) => {
						const digest = blobs.get(path);
						if (digest === undefined) throw new Error(`Missing summary blob: ${path}`);
						return (await client.fetchBlob(digest)).slice().buffer;
					},
					contains: async (path) => blobs.has(path),
					list: async (path) => {
						const prefix = path.length === 0 ? "" : `${path.replace(/\/$/u, "")}/`;
						return [...blobs.keys()]
							.filter((key) => key.startsWith(prefix))
							.map((key) => key.slice(prefix.length));
					},
				});
				host.cursor = snapshot.atEvent;
				host.loadedFromSummary = true;
			}
			await host.catchUp();
			await host.startSubscription();
			host.scheduleSummary();
			return host;
		} catch (error) {
			if (host !== undefined) await host.dispose();
			else client.disconnect();
			throw error;
		}
	}

	/** Registers a listener for connection, pending-edit, and summary status changes. */
	public onStatusChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Waits for current local work, including recovery, to be acknowledged. */
	public async waitForIdle(): Promise<void> {
		const deadline = performance.now() + 30_000;
		while (this.pending.length !== 0 || this.connectionState === "reconnecting") {
			if (this.connectionState === "error" || this.connectionState === "disposed") {
				throw this.lastError ?? new Error(`Direct SharedTree is ${this.connectionState}`);
			}
			if (performance.now() >= deadline)
				throw new Error("Direct SharedTree timed out waiting for acknowledgment");
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		if (this.connectionState !== "connected") {
			throw this.lastError ?? new Error(`Direct SharedTree is ${this.connectionState}`);
		}
	}

	/** Pauses transport without discarding the tree or its unacknowledged edits. */
	public disconnect(): void {
		if (this.connectionState === "disposed") return;
		this.generation++;
		this.state = "disconnected";
		this.stopTransport();
		this.notify();
	}

	/** Resumes transport and reconciles the old terminal prefix before resubmitting. */
	public async reconnect(): Promise<void> {
		if (this.connectionState === "disposed" || this.connectionState === "error") {
			throw this.lastError ?? new Error(`Direct SharedTree is ${this.connectionState}`);
		}
		if (this.connectionState === "connected") return;
		if (this.recovery !== undefined) {
			await this.recovery;
			return this.reconnect();
		}
		this.state = "reconnecting";
		this.beginRecovery(this.lastError);
		await this.recovery;
	}

	/** Publishes a full summary if this host has authority and no local edits are pending. */
	public async summarize(): Promise<void> {
		if (this.summarizing !== undefined) return this.summarizing;
		const work = this.summarizeCore();
		this.summarizing = work;
		try {
			await work;
		} finally {
			this.summarizing = undefined;
		}
	}

	/** Stops all host work; callers dispose application views first. */
	public async dispose(): Promise<void> {
		if (this.connectionState === "disposed") return;
		this.generation++;
		this.state = "disposed";
		this.stopTransport();
		this.notify();
		await Promise.allSettled([
			this.sending,
			this.recovery,
			this.summarizing,
			this.subscriptionPump,
		]);
		this.listeners.clear();
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	private stopTransport(): void {
		clearTimeout(this.summaryTimer);
		this.summaryTimer = undefined;
		const subscription = this.subscription;
		this.subscription = undefined;
		if (subscription !== undefined) {
			void Promise.resolve(subscription.cancel()).catch((error: unknown) => {
				this.lastError = error;
				this.notify();
			});
		}
		this.client.disconnect();
	}

	private sendPending(): void {
		if (this.connectionState !== "connected" || this.sending !== undefined) return;
		const generation = this.generation;
		const work = async (): Promise<void> => {
			for (;;) {
				if (generation !== this.generation || this.connectionState !== "connected") return;
				const pending = this.pending.find((message) => message.session === undefined);
				if (pending === undefined) return;
				pending.session = this.session.slice();
				await this.client.submitEvent(
					encoder.encode(JSON.stringify(pending.payload)),
					pending.reference,
				);
			}
		};
		this.sending = work().then(
			() => {
				this.sending = undefined;
				if (this.pending.some((message) => message.session === undefined)) this.sendPending();
			},
			(error: unknown) => {
				this.sending = undefined;
				if (generation === this.generation) this.beginRecovery(error);
			},
		);
	}

	private async catchUp(): Promise<void> {
		const history = await this.client.readProjected(this.cursor);
		this.applyOperations(history.operations);
		this.cursor = history.cursor;
	}

	private async startSubscription(): Promise<void> {
		const generation = this.generation;
		const subscription = await this.client.subscribeProjected(this.cursor);
		if (generation !== this.generation) {
			await subscription.cancel();
			return;
		}
		this.subscription = subscription;
		this.subscriptionPump = this.consumeSubscription(subscription);
	}

	private async consumeSubscription(
		subscription: ProjectedOperationSubscription,
	): Promise<void> {
		while (this.subscription === subscription) {
			let operations: readonly ProjectedOperation[];
			try {
				operations =
					subscription.nextBatch === undefined
						? [await subscription.next()]
						: await subscription.nextBatch(this.batchMaxOperations, this.batchMaxPayloadBytes);
			} catch (error) {
				if (this.subscription === subscription) this.beginRecovery(error);
				return;
			}
			if (this.subscription !== subscription) return;
			try {
				if (operations.length === 0)
					throw new Error("Direct SharedTree subscription returned an empty batch");
				this.applyOperations(operations);
			} catch (error) {
				this.lastError = error;
				this.state = "error";
				this.stopTransport();
				this.notify();
				return;
			}
		}
	}

	private applyOperations(operations: readonly ProjectedOperation[]): void {
		let applied = 0;
		for (const operation of operations) {
			const sequenceNumber = Number(operation.sequenceNumber);
			if (sequenceNumber <= this.lastAppliedSequenceNumber) continue;
			this.positions.set(byteKey(operation.position), sequenceNumber);
			// Edits made by change listeners must reference the operation they are observing.
			this.lastAppliedSequenceNumber = sequenceNumber;
			this.cursor = operation.position;
			if (operation.eventType === "left")
				this.terminalSessions.add(byteKey(operation.session));
			if (operation.eventType === undefined || operation.eventType === "application") {
				const payload = JSON.parse(
					decoder.decode(operation.payload),
				) as DirectSharedTreePayload;
				const local = this.localSessions.has(byteKey(operation.session));
				if (local) {
					const first = this.pending[0];
					if (
						first === undefined ||
						first.payload.clientSequenceNumber !== payload.clientSequenceNumber
					) {
						throw new Error("Direct SharedTree acknowledgment is not the pending prefix");
					}
					this.pending.shift();
				}
				this.tree.kernel.processSequencedMessages([
					{
						contents: payload.contents,
						idCreationRange: payload.idCreationRange,
						sequenceNumber,
						referenceSequenceNumber: this.sequenceForReference(operation.reference),
						minimumSequenceNumber: this.sequenceForReference(operation.minimumReference),
						local,
					},
				]);
				applied++;
			}
		}
		if (applied > 0) {
			this.deliveredBatchCount++;
			this.peakDeliveredBatchOperations = Math.max(this.peakDeliveredBatchOperations, applied);
			this.dirtyOperations += applied;
			this.scheduleSummary();
		}
		this.notify();
	}

	private beginRecovery(error: unknown): void {
		if (
			this.connectionState === "disposed" ||
			this.connectionState === "disconnected" ||
			this.connectionState === "error"
		) {
			return;
		}
		if (this.client.announceMembership === undefined) {
			this.fail(
				new Error("Direct SharedTree recovery requires authoritative membership", {
					cause: error,
				}),
			);
			return;
		}
		this.lastError = error;
		this.state = "reconnecting";
		this.generation++;
		this.stopTransport();
		this.notify();
		if (this.recovery !== undefined) {
			this.recoveryRequested = true;
			return;
		}
		const generation = this.generation;
		this.recovery = this.recover(generation).finally(() => {
			this.recovery = undefined;
			if (this.recoveryRequested) {
				this.recoveryRequested = false;
				this.beginRecovery(this.lastError);
			}
		});
	}

	private async recover(generation: number): Promise<void> {
		await Promise.allSettled([this.sending, this.summarizing]);
		for (let attempt = 0; generation === this.generation; attempt++) {
			let history: ProjectedReadPage;
			try {
				await this.client.reconnect();
				await this.client.openSession(
					this.documentId,
					encoder.encode(this.compressor.localSessionId),
					this.cursor,
				);
				if (generation !== this.generation) {
					this.client.disconnect();
					return;
				}
				this.session = this.client.sessionId ?? encoder.encode(this.compressor.localSessionId);
				this.localSessions.add(byteKey(this.session));
				await this.client.announceMembership?.(
					encoder.encode(JSON.stringify({ mode: "write" })),
				);
				history = await this.client.readProjected(this.cursor);
			} catch (error) {
				if (generation !== this.generation) return;
				await this.retryRecovery(error, attempt);
				continue;
			}
			if (generation !== this.generation) return;
			try {
				this.applyOperations(history.operations);
				this.cursor = history.cursor;
			} catch (error) {
				this.fail(error);
				return;
			}
			if (
				this.pending.some(
					(pending) =>
						pending.session !== undefined &&
						!this.terminalSessions.has(byteKey(pending.session)),
				)
			) {
				await this.retryRecovery(
					new Error("Old SEA author has not reached its terminal leave"),
					attempt,
				);
				continue;
			}
			try {
				const suffix = this.pending.splice(0);
				toIdCompressorWithCore(this.compressor).resetUnfinalizedCreationRange();
				for (const pending of suffix) {
					this.tree.kernel.reSubmitCore(pending.payload.contents, pending.metadata);
				}
			} catch (error) {
				this.fail(error);
				return;
			}
			try {
				await this.startSubscription();
			} catch (error) {
				if (generation !== this.generation) return;
				await this.retryRecovery(error, attempt);
				continue;
			}
			if (generation !== this.generation) return;
			this.state = "connected";
			this.lastError = undefined;
			this.notify();
			this.sendPending();
			this.scheduleSummary();
			return;
		}
	}

	/** Exposes retryable transport failures while bounding reconnect frequency. */
	private async retryRecovery(error: unknown, attempt: number): Promise<void> {
		this.lastError = error;
		this.client.disconnect();
		this.notify();
		await new Promise((resolve) => setTimeout(resolve, Math.min(1_000 * 2 ** attempt, 5_000)));
	}

	/** Stops on invalid canonical history or a failed kernel transformation. */
	private fail(error: unknown): void {
		this.lastError = error;
		this.state = "error";
		this.stopTransport();
		this.notify();
	}

	private scheduleSummary(retry = false): void {
		if (this.connectionState !== "connected") return;
		clearTimeout(this.summaryTimer);
		this.summaryTimer = setTimeout(
			() => {
				this.summaryTimer = undefined;
				void this.summarize()
					.catch((error: unknown) => {
						this.lastError = error;
						this.notify();
					})
					.finally(() => {
						if (this.dirtyOperations > 0) this.scheduleSummary(true);
					});
			},
			!retry &&
				this.dirtyOperations >= this.summaryMaxOperations &&
				this.pending.length === 0 &&
				this.client.canPublishSnapshot !== false
				? 0
				: this.summaryIdleMs,
		);
	}

	private async summarizeCore(): Promise<void> {
		if (
			this.connectionState !== "connected" ||
			this.pending.length > 0 ||
			this.dirtyOperations === 0 ||
			!this.canSummarize()
		)
			return;
		const generation = this.generation;
		const parent = await this.client.latestSnapshot();
		if (generation !== this.generation || this.pending.length > 0 || this.cursor === undefined)
			return;
		const parentSequence =
			parent?.atEvent === undefined ? 0 : this.sequenceForReference(parent.atEvent);
		if (parentSequence >= this.lastAppliedSequenceNumber) {
			this.lastSummarySequenceNumber = parentSequence;
			this.dirtyOperations = 0;
			this.notify();
			return;
		}
		const sequenceNumber = this.lastAppliedSequenceNumber;
		const position = this.cursor.slice();
		const dirtyOperations = this.dirtyOperations;
		const summary = this.tree.kernel.getSummary();
		const metadata: SnapshotMetadata = {
			version: 1,
			sequenceNumber,
			positions: [...this.positions],
			compressor: serializeIdCompressor(this.compressor, false),
		};
		summary.tree[metadataPath] = { type: 2, content: JSON.stringify(metadata) };
		const root = await new SeaDocumentStorage(this.client).uploadSummaryTree(summary);
		if (generation !== this.generation || !this.canSummarize()) return;
		await this.client.publishSnapshotRoot(parent?.id, position, root);
		if (generation !== this.generation) return;
		this.lastSummarySequenceNumber = sequenceNumber;
		this.dirtyOperations -= dirtyOperations;
		this.summaryCount++;
		this.lastError = undefined;
		this.notify();
	}

	private canSummarize(): boolean {
		return this.client.canPublishSnapshot !== false;
	}

	private sequenceForReference(reference: Uint8Array | undefined): number {
		if (reference === undefined) return 0;
		const sequenceNumber = this.positions.get(byteKey(reference));
		if (sequenceNumber === undefined)
			throw new Error("Direct SharedTree references an unknown service position");
		return sequenceNumber;
	}
}

/** Stable key for opaque service identities. */
function byteKey(value: Uint8Array): string {
	return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
