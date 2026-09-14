import type { IEventTransformer, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import type {
	ConnectionMode,
	IClient,
	IClientConfiguration,
	ICreateBlobResponse,
	IDocumentDeltaConnection,
	IDocumentDeltaConnectionEvents,
	IDocumentDeltaStorageService,
	IDocumentMessage,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentServiceFactory,
	IDocumentStorageService,
	IResolvedUrl,
	ISequencedDocumentMessage,
	ISequencedDocumentSystemMessage,
	ISignalClient,
	ISignalMessage,
	ISnapshotTree,
	IStream,
	ISummaryContext,
	ISummaryHandle,
	ITokenClaims,
	IVersion,
} from "@fluidframework/driver-definitions/internal";

import { ProtocolClient } from "./protocolClient.js";
import type {
	ProjectedOperation,
	ProjectedOperationSubscription,
	SubmissionStream,
	SubmissionResolution,
	SummaryEntry,
	WasmProtocolClient,
} from "./wasmClient.js";

/** UTF-8 encoder for protocol identities, payloads, and summary paths. */
const encoder = new TextEncoder();
/** UTF-8 decoder for Fluid operation and summary payloads. */
const decoder = new TextDecoder();
/** Numeric Fluid summary node kinds accepted by the minimal full-tree adapter. */
const summaryType = { tree: 1, blob: 2 } as const;
/** Synthetic member identity used for read-first service replacement. */
const remoteClientId = "remote-service-client";
/** Synthetic member identity used for independently connected write clients. */
const externalClientId = "external-service-client";
/** Number of initial join messages preceding application operations. */
const applicationSequenceOffset = 2;
const defaultSubscriptionBatchMaxOperations = 64;
const defaultSubscriptionBatchMaxPayloadBytes = 1024 * 1024;

/** Listener shape used by the minimal event emitter. */
type Listener = (...args: readonly unknown[]) => void;

/** Serializes access to a generated client whose methods are not reentrant. */
class SerializedWasmProtocolClient implements WasmProtocolClient {
	/** Tail of the serialized operation chain, normalized to never reject. */
	private tail: Promise<void> = Promise.resolve();
	/** Serialized submission-stream opener when supported by the inner client. */
	public readonly openSubmissionStream?: (document: Uint8Array) => Promise<SubmissionStream>;

	/** Wraps one generated client and preserves its optional streaming capability. */
	public constructor(private readonly inner: WasmProtocolClient) {
		const openSubmissionStream = inner.openSubmissionStream;
		if (openSubmissionStream !== undefined) {
			this.openSubmissionStream = (document) =>
				this.enqueue(async () => openSubmissionStream.call(inner, document));
		}
	}

	/** Serializes a unary request with all other generated-client operations. */
	public request(frame: Uint8Array): Promise<Uint8Array> {
		return this.enqueue(async () => this.inner.request(frame));
	}

	/** Serializes a projected history read. */
	public readProjected(document: Uint8Array, after?: Uint8Array) {
		return this.enqueue(async () => this.inner.readProjected(document, after));
	}

	/** Serializes projected-subscription creation. */
	public subscribeProjected(document: Uint8Array, after?: Uint8Array) {
		return this.enqueue(async () => this.inner.subscribeProjected(document, after));
	}

	/** Serializes authoritative submission resolution. */
	public resolveSubmission(
		document: Uint8Array,
		writer: Uint8Array,
		session: Uint8Array,
		submission: Uint8Array,
	) {
		return this.enqueue(async () =>
			this.inner.resolveSubmission(document, writer, session, submission),
		);
	}

	/** Serializes immutable blob upload. */
	public uploadBlob(payload: Uint8Array) {
		return this.enqueue(async () => this.inner.uploadBlob(payload));
	}

	/** Serializes immutable blob fetch. */
	public fetchBlob(digest: Uint8Array) {
		return this.enqueue(async () => this.inner.fetchBlob(digest));
	}

	/** Serializes summary publication. */
	public publishSummary(entries: readonly SummaryEntry[]) {
		return this.enqueue(async () => this.inner.publishSummary(entries));
	}

	/** Serializes summary fetch. */
	public fetchSummary(digest: Uint8Array) {
		return this.enqueue(async () => this.inner.fetchSummary(digest));
	}

	/** Immediately disconnects the inner transport. */
	public disconnect(): void {
		this.inner.disconnect();
	}

	/** Serializes transport reconnection. */
	public reconnect(...args: readonly unknown[]): Promise<void> {
		return this.enqueue(async () => this.inner.reconnect(...args));
	}

	/** Forwards total wire-byte accounting from the inner client. */
	public get wireBytes(): bigint {
		return this.inner.wireBytes;
	}

	/** Forwards the peak unary response size from the inner client. */
	public get peakResponseBytes(): number {
		return this.inner.peakResponseBytes;
	}

	/** Forwards the peak subscription frame size from the inner client. */
	public get peakSubscriptionFrameBytes(): number {
		return this.inner.peakSubscriptionFrameBytes;
	}

	/** Forwards the peak subscription queue depth from the inner client. */
	public get peakSubscriptionQueueDepth(): number {
		return this.inner.peakSubscriptionQueueDepth;
	}

	/** Appends an operation while keeping the chain usable after rejection. */
	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.tail.then(operation, operation);
		this.tail = result.then(
			() => {},
			() => {},
		);
		return result;
	}
}

/** Minimal event emitter implementing the Fluid driver event methods. */
class Events {
	/** Event listeners grouped by Fluid event name. */
	private readonly listeners = new Map<string, Set<Listener>>();

	/** Registers a persistent listener. */
	protected addListener(event: string, listener: Listener): this {
		const listeners = this.listeners.get(event) ?? new Set<Listener>();
		listeners.add(listener);
		this.listeners.set(event, listeners);
		return this;
	}

	/** Registers a listener that removes itself before invocation. */
	protected onceListener(event: string, listener: Listener): this {
		const once = (...args: readonly unknown[]): void => {
			this.removeListener(event, once);
			listener(...args);
		};
		return this.addListener(event, once);
	}

	/** Removes a previously registered listener. */
	protected removeListener(event: string, listener: Listener): this {
		this.listeners.get(event)?.delete(listener);
		return this;
	}

	/** Invokes the current listener set for an event. */
	protected emit(event: string, ...args: readonly unknown[]): void {
		for (const listener of this.listeners.get(event) ?? []) {
			listener(...args);
		}
	}
}

/** Converts bytes to the lowercase hexadecimal identifiers exposed by Fluid storage. */
function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

/** Parses a 32-byte hexadecimal content digest. */
function hexToBytes(value: string): Uint8Array {
	if (!/^[0-9a-f]{64}$/u.test(value)) {
		throw new Error(`invalid content digest: ${value}`);
	}
	return Uint8Array.from(value.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
}

/** Encodes the resolved Fluid document ID for protocol requests. */
function documentId(resolvedUrl: IResolvedUrl): Uint8Array {
	return encoder.encode(resolvedUrl.id);
}

/** A published summary and the entries used to construct it. */
interface UploadedSummary {
	/** Content digest returned by summary publication. */
	readonly digest: Uint8Array;
	/** Canonically ordered flattened summary entries. */
	readonly entries: readonly SummaryEntry[];
}

/** Content-addressed storage adapter for full Fluid summary trees and blobs. */
export class MinimalWasmStorage implements IDocumentStorageService {
	/** Fluid cache policy for immutable content-addressed storage. */
	public readonly policies = { maximumCacheDurationMs: 432_000_000 as const };

	/** Creates storage for one document over a shared serialized client. */
	public constructor(
		private readonly document: Uint8Array,
		private readonly client: WasmProtocolClient,
		private readonly protocol: ProtocolClient,
	) {}

	/** Resolves the latest summary or a caller-provided content digest. */
	public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
		if (count <= 0) {
			return [];
		}
		const digest =
			versionId === null
				? await this.protocol.latestSummaryDigest(this.document)
				: hexToBytes(versionId);
		return digest === undefined
			? []
			: [{ id: bytesToHex(digest), treeId: bytesToHex(digest) }];
	}

	/** Reconstructs a Fluid snapshot tree from a flattened summary manifest. */
	public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
		const versions = version === undefined ? await this.getVersions(null, 1) : [version];
		const selected = versions[0];
		if (selected === undefined) {
			return null;
		}
		const entries = await this.client.fetchSummary(hexToBytes(selected.id));
		return this.snapshotTree(selected.id, entries);
	}

	/** Uploads an immutable blob and returns its hexadecimal content digest. */
	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		const upload = await this.client.uploadBlob(new Uint8Array(file));
		return { id: bytesToHex(upload.digest) };
	}

	/** Reads an immutable blob by hexadecimal content digest. */
	public async readBlob(id: string): Promise<ArrayBufferLike> {
		return (await this.client.fetchBlob(hexToBytes(id))).slice().buffer;
	}

	/** Uploads a full summary and publishes it as the latest snapshot. */
	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		_context: ISummaryContext,
	): Promise<string> {
		const uploaded = await this.uploadSummary(summary);
		await this.protocol.publishSnapshot(this.document, uploaded.digest);
		return bytesToHex(uploaded.digest);
	}

	/** Reconstructs a full summary tree from a published summary handle. */
	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		if (handle.handleType !== summaryType.tree) {
			throw new Error("only full summary-tree handles are supported");
		}
		const entries = await this.client.fetchSummary(hexToBytes(handle.handle));
		const tree: ISummaryTree = { type: summaryType.tree, tree: {} };
		for (const entry of entries) {
			this.insertSummaryBlob(
				tree,
				decoder.decode(entry.path),
				await this.client.fetchBlob(entry.blob),
			);
		}
		return tree;
	}

	/** Satisfies the storage interface; this adapter owns no independent resources. */
	public dispose(): void {}

	/** Uploads and publishes the detached container's initial full summary. */
	public async uploadInitialSummary(summary: ISummaryTree): Promise<void> {
		const uploaded = await this.uploadSummary(summary);
		await this.protocol.publishSnapshot(this.document, uploaded.digest);
	}

	/** Flattens, uploads, and publishes a full summary in canonical path order. */
	private async uploadSummary(summary: ISummaryTree): Promise<UploadedSummary> {
		const entries: SummaryEntry[] = [];
		const app = summary.tree[".app"];
		const protocol = summary.tree[".protocol"];
		if (app?.type === summaryType.tree && protocol?.type === summaryType.tree) {
			await this.flattenSummary(app, "", entries);
			await this.flattenSummary(protocol, ".protocol", entries);
		} else {
			await this.flattenSummary(summary, "", entries);
		}
		entries.sort((left, right) => compareBytes(left.path, right.path));
		const publication = await this.client.publishSummary(entries);
		return { digest: publication.digest, entries };
	}

	/** Recursively uploads summary blobs into a flat path-to-digest manifest. */
	private async flattenSummary(
		summary: ISummaryTree,
		prefix: string,
		entries: SummaryEntry[],
	): Promise<void> {
		for (const [name, object] of Object.entries(summary.tree)) {
			const path = prefix.length === 0 ? name : `${prefix}/${name}`;
			if (object.type === summaryType.tree) {
				await this.flattenSummary(object, path, entries);
			} else if (object.type === summaryType.blob) {
				const payload =
					typeof object.content === "string" ? encoder.encode(object.content) : object.content;
				const upload = await this.client.uploadBlob(payload);
				entries.push({ path: encoder.encode(path), blob: upload.digest });
			} else {
				throw new Error("summary handles and attachments are unsupported");
			}
		}
	}

	/** Reconstructs Fluid's snapshot-tree shape from a flat summary manifest. */
	private snapshotTree(id: string, entries: readonly SummaryEntry[]): ISnapshotTree {
		const root: ISnapshotTree = { id, blobs: {}, trees: {} };
		for (const entry of entries) {
			const parts = decoder.decode(entry.path).split("/");
			const name = parts.pop();
			if (name === undefined || name.length === 0) {
				throw new Error("invalid empty summary path");
			}
			let parent = root;
			for (const part of parts) {
				parent = parent.trees[part] ??= { blobs: {}, trees: {} };
			}
			parent.blobs[name] = bytesToHex(entry.blob);
		}
		return root;
	}

	/** Inserts one fetched blob into a mutable full-summary tree. */
	private insertSummaryBlob(tree: ISummaryTree, path: string, payload: Uint8Array): void {
		const parts = path.split("/");
		const name = parts.pop();
		if (name === undefined || name.length === 0) {
			throw new Error("invalid empty summary path");
		}
		let parent = tree;
		for (const part of parts) {
			const existing = parent.tree[part];
			if (existing === undefined) {
				const child: ISummaryTree = { type: summaryType.tree, tree: {} };
				parent.tree[part] = child;
				parent = child;
			} else if (existing.type === summaryType.tree) {
				parent = existing;
			} else {
				throw new Error(`summary path collides at ${part}`);
			}
		}
		parent.tree[name] = { type: summaryType.blob, content: payload };
	}
}

/** Compares byte strings lexicographically for deterministic summary ordering. */
function compareBytes(left: Uint8Array, right: Uint8Array): number {
	const length = Math.min(left.length, right.length);
	for (let index = 0; index < length; index++) {
		const difference = (left.at(index) ?? 0) - (right.at(index) ?? 0);
		if (difference !== 0) {
			return difference;
		}
	}
	return left.length - right.length;
}

/** Projects a service operation into Fluid's sequenced document-message shape. */
function toSequenced(
	operation: ProjectedOperation,
	localWriter?: Uint8Array,
	localClientId?: string,
	projectedRemoteClientId = remoteClientId,
	remoteClientSequenceNumber = Number(operation.sequenceNumber),
): ISequencedDocumentMessage {
	const message = JSON.parse(decoder.decode(operation.payload)) as IDocumentMessage;
	const isLocal =
		localWriter !== undefined &&
		localClientId !== undefined &&
		bytesEqual(operation.writer, localWriter);
	return {
		...message,
		clientId: isLocal ? localClientId : projectedRemoteClientId,
		clientSequenceNumber: isLocal ? message.clientSequenceNumber : remoteClientSequenceNumber,
		sequenceNumber: Number(operation.sequenceNumber) + applicationSequenceOffset,
		minimumSequenceNumber: applicationSequenceOffset,
		timestamp: 0,
	};
}

/** Tests byte-string identity without allocating an encoded key. */
function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/** Finite paged stream used by Fluid delta storage reads. */
class ProjectedMessageStream implements IStream<ISequencedDocumentMessage[]> {
	/** Cursor returned by the latest projected read. */
	private cursor: Uint8Array | undefined;
	/** Whether the service reported its final projected page. */
	private done = false;

	/** Creates a bounded view over projected operations in the requested sequence range. */
	public constructor(
		private readonly client: WasmProtocolClient,
		private readonly document: Uint8Array,
		private readonly from: number,
		private readonly to: number | undefined,
		private readonly project: (operation: ProjectedOperation) => ISequencedDocumentMessage,
	) {}

	/** Reads the next filtered projected page, ending after the service's final page. */
	public async read(): Promise<
		{ done: true } | { done: false; value: ISequencedDocumentMessage[] }
	> {
		if (this.done) {
			return { done: true };
		}
		const page = await this.client.readProjected(this.document, this.cursor);
		this.cursor = page.cursor;
		this.done = !page.hasMore;
		const messages = page.operations
			.filter(
				({ sequenceNumber }) =>
					Number(sequenceNumber) + applicationSequenceOffset >= this.from &&
					(this.to === undefined ||
						Number(sequenceNumber) + applicationSequenceOffset < this.to),
			)
			.map(this.project);
		return messages.length === 0 && this.done
			? { done: true }
			: { done: false, value: messages };
	}
}

/** Bounded projected-operation history adapter for Fluid delta storage. */
export class MinimalWasmDeltaStorage implements IDocumentDeltaStorageService {
	/** Creates delta storage for one document and projection policy. */
	public constructor(
		private readonly client: WasmProtocolClient,
		private readonly document: Uint8Array,
		private readonly project: (
			operation: ProjectedOperation,
		) => ISequencedDocumentMessage = toSequenced,
	) {}

	/** Returns a finite stream filtered to Fluid's half-open sequence interval. */
	public fetchMessages(
		from: number,
		to: number | undefined,
	): IStream<ISequencedDocumentMessage[]> {
		return new ProjectedMessageStream(this.client, this.document, from, to, this.project);
	}
}

/** Stable identity and payload retained until submission outcome is known. */
interface PendingSubmission {
	/** Service-level submission identity reused for resolution and resubmission. */
	readonly identity: Uint8Array;
	/** Original Fluid message retained for explicit resubmission. */
	readonly message: IDocumentMessage;
}

/** Document-service state preserved across read-to-write replacement and reconnect. */
interface DeltaConnectionLifecycle {
	/** Logical Fluid client identity represented by this service. */
	readonly clientId: string;
	/** Synthetic identity assigned to operations from other writers. */
	readonly remoteClientId: string;
	/** Stable protocol writer identity. */
	readonly writer: Uint8Array;
	/** Stable protocol session identity. */
	readonly session: Uint8Array;
	/** Last projected cursor consumed by reads or subscriptions. */
	cursor: Uint8Array | undefined;
	/** Last committed local submission position. */
	lastPosition: Uint8Array | undefined;
	/** Next synthetic client sequence number for a remote writer. */
	remoteClientSequenceNumber: number;
	/** Stable synthetic sequence numbers keyed by remote operation position. */
	readonly remoteSequenceNumbers: Map<string, number>;
}

/** Projects an operation using identities and cursors shared by one document service. */
function projectOperation(
	lifecycle: DeltaConnectionLifecycle,
	operation: ProjectedOperation,
): ISequencedDocumentMessage {
	const isLocal = bytesEqual(operation.writer, lifecycle.writer);
	let remoteSequenceNumber = lifecycle.remoteClientSequenceNumber;
	if (!isLocal) {
		const position = bytesToHex(operation.position);
		remoteSequenceNumber = lifecycle.remoteSequenceNumbers.get(position) ?? 0;
		if (remoteSequenceNumber === 0) {
			remoteSequenceNumber = ++lifecycle.remoteClientSequenceNumber;
			lifecycle.remoteSequenceNumbers.set(position, remoteSequenceNumber);
		}
	}
	return toSequenced(
		operation,
		lifecycle.writer,
		lifecycle.clientId,
		lifecycle.remoteClientId,
		remoteSequenceNumber,
	);
}

/** Minimal Fluid delta connection with explicit reconnect and ambiguity recovery. */
export class MinimalWasmDeltaConnection extends Events implements IDocumentDeltaConnection {
	/** Registers a Fluid delta-connection event listener. */
	public readonly on = this.addListener as unknown as IEventTransformer<
		this,
		IDocumentDeltaConnectionEvents
	>;
	/** Registers a one-shot Fluid delta-connection event listener. */
	public readonly once = this.onceListener as unknown as IEventTransformer<
		this,
		IDocumentDeltaConnectionEvents
	>;
	/** Removes a Fluid delta-connection event listener. */
	public readonly off = this.removeListener as unknown as IEventTransformer<
		this,
		IDocumentDeltaConnectionEvents
	>;
	/** Synthetic claims sufficient for the isolated Fluid harness. */
	public readonly claims: ITokenClaims;
	/** Indicates that the document already exists when a connection is opened. */
	public readonly existing = true;
	/** Minimal protocol version exposed to Fluid's loader. */
	public readonly version = "^0.1.0";
	/** Synthetic join messages that establish local and remote membership. */
	public readonly initialMessages: ISequencedDocumentMessage[];
	/** Signals are unsupported, so the initial signal list is empty. */
	public readonly initialSignals: ISignalMessage[] = [];
	/** No Routerlicious service configuration is exposed by this adapter. */
	public readonly serviceConfiguration = {} as IClientConfiguration;
	/** Highest projected Fluid sequence number observed by this connection. */
	public checkpointSequenceNumber = 0;
	/** Submissions whose authoritative outcome is not yet known. */
	public readonly pending = new Map<number, PendingSubmission>();
	/** Submitted messages waiting for a contiguous local sequence prefix. */
	private readonly queuedSubmissions = new Map<number, PendingSubmission>();
	/** Next local sequence number eligible for submission. */
	private nextClientSequenceNumber = 1;
	/** Ordered acknowledgement chain observed by waitForIdle. */
	private submitChain: Promise<void> = Promise.resolve();
	/** Ordered write chain that allows multiple acknowledgements to remain pending. */
	private submissionWriteChain: Promise<void> = Promise.resolve();
	/** Current ordered submission stream, when the generated client supports one. */
	private submissionStream: SubmissionStream | undefined;
	/** Current projected-operation subscription. */
	private subscription: ProjectedOperationSubscription | undefined;
	/** Pump consuming the current projected-operation subscription. */
	private subscriptionPump: Promise<void> | undefined;
	/** Whether the Fluid connection has been synchronously disposed. */
	public disposed = false;
	/** Number of projected-operation batches delivered to Fluid. */
	public subscriptionBatchCount = 0;
	/** Largest projected-operation batch delivered to Fluid. */
	public peakSubscriptionBatchOperations = 0;

	/** Creates a connection over document-scoped lifecycle state and one client. */
	public constructor(
		public readonly clientId: string,
		private readonly lifecycle: DeltaConnectionLifecycle,
		private readonly document: Uint8Array,
		private readonly client: WasmProtocolClient,
		private readonly protocol: ProtocolClient,
		fluidClient: IClient,
		public readonly mode: ConnectionMode,
		public readonly initialClients: ISignalClient[],
		private readonly onSynchronizationError?: (error: unknown) => void,
		private readonly onSynchronized?: (
			clientId: string,
			messages: readonly ISequencedDocumentMessage[],
		) => void,
		private readonly subscriptionBatchMaxOperations = defaultSubscriptionBatchMaxOperations,
		private readonly subscriptionBatchMaxPayloadBytes = defaultSubscriptionBatchMaxPayloadBytes,
	) {
		super();
		const remoteFluidClient = { ...fluidClient, mode: "write" } satisfies IClient;
		this.initialMessages = [
			{
				sequenceNumber: 1,
				minimumSequenceNumber: 0,
				clientSequenceNumber: 0,
				type: MessageType.ClientJoin,
				clientId: null,
				referenceSequenceNumber: 0,
				contents: "",
				timestamp: 0,
				data: JSON.stringify({
					clientId: lifecycle.clientId,
					detail: remoteFluidClient,
				}),
			} satisfies ISequencedDocumentSystemMessage,
			{
				sequenceNumber: 2,
				minimumSequenceNumber: 0,
				clientSequenceNumber: 0,
				type: MessageType.ClientJoin,
				clientId: null,
				referenceSequenceNumber: 0,
				contents: "",
				timestamp: 0,
				data: JSON.stringify({
					clientId: lifecycle.remoteClientId,
					detail: remoteFluidClient,
				}),
			},
		];
		this.checkpointSequenceNumber = applicationSequenceOffset;
		this.claims = {
			documentId: decoder.decode(document),
			scopes: ["doc:read", "doc:write", "summary:write"],
			tenantId: "minimal-wasm-driver",
			user: { id: clientId },
			iat: 0,
			exp: Number.MAX_SAFE_INTEGER,
			ver: "1.0",
		};
	}

	/** Opens the protocol session, submission stream, and projected subscription. */
	public async open(): Promise<void> {
		await this.protocol.openSession(
			this.document,
			this.lifecycle.writer,
			this.lifecycle.session,
			this.lifecycle.lastPosition,
		);
		this.submissionStream ??= await this.client.openSubmissionStream?.(this.document);
		this.subscription = await this.client.subscribeProjected(
			this.document,
			this.lifecycle.cursor,
		);
		this.subscriptionPump = this.consumeSubscription(this.subscription);
	}

	/** Queues Fluid messages for contiguous ordered submission. */
	public submit(messages: IDocumentMessage[]): void {
		for (const message of messages) {
			const identity = encoder.encode(`${this.clientId}-${message.clientSequenceNumber}`);
			const pending = { identity, message };
			this.pending.set(message.clientSequenceNumber, pending);
			this.queuedSubmissions.set(message.clientSequenceNumber, pending);
		}
		this.scheduleQueuedSubmissions();
	}

	/** Advances the contiguous submission prefix through streaming or unary requests. */
	private scheduleQueuedSubmissions(): void {
		for (;;) {
			const pending = this.queuedSubmissions.get(this.nextClientSequenceNumber);
			if (pending === undefined) {
				return;
			}
			const { identity, message } = pending;
			this.queuedSubmissions.delete(this.nextClientSequenceNumber);
			this.nextClientSequenceNumber++;
			const submissionStream = this.submissionStream;
			if (submissionStream !== undefined) {
				const request = this.protocol.submissionRequest(
					this.document,
					this.lifecycle.writer,
					this.lifecycle.session,
					identity,
					message.clientSequenceNumber,
					encoder.encode(JSON.stringify(message)),
					this.lifecycle.lastPosition,
				);
				const write = this.submissionWriteChain.then(async () =>
					submissionStream.send(request),
				);
				this.submissionWriteChain = write;
				this.submitChain = this.submitChain.then(async () => {
					await write;
					const position = this.protocol.submissionPosition(await submissionStream.next());
					this.lifecycle.lastPosition = position;
					this.pending.delete(message.clientSequenceNumber);
				});
				continue;
			}
			this.submitChain = this.submitChain.then(async () => {
				const position = await this.protocol.submit(
					this.document,
					this.lifecycle.writer,
					this.lifecycle.session,
					identity,
					message.clientSequenceNumber,
					encoder.encode(JSON.stringify(message)),
					this.lifecycle.lastPosition,
				);
				this.lifecycle.lastPosition = position;
				this.pending.delete(message.clientSequenceNumber);
			});
		}
	}

	/** Rejects signal submission because this minimal driver has no signal protocol. */
	public submitSignal(): void {
		throw new Error("signals are unsupported");
	}

	/** Waits for all currently scheduled submissions or their first failure. */
	public async waitForIdle(): Promise<void> {
		await this.submitChain;
	}

	/** Reopens the projected subscription from the last consumed cursor. */
	public async restartSubscription(): Promise<boolean> {
		const resumedFromCursor = this.lifecycle.cursor !== undefined;
		await this.stopSubscription();
		await this.open();
		return resumedFromCursor;
	}

	/** Reads and emits projected operations that are not yet consumed by the subscription. */
	public async synchronize(): Promise<ISequencedDocumentMessage[]> {
		const page = await this.client.readProjected(this.document, this.lifecycle.cursor);
		this.lifecycle.cursor = page.cursor;
		const messages = page.operations.map((operation) =>
			projectOperation(this.lifecycle, operation),
		);
		if (messages.length > 0) {
			this.checkpointSequenceNumber =
				messages.at(-1)?.sequenceNumber ?? this.checkpointSequenceNumber;
			this.emit("op", decoder.decode(this.document), messages);
		}
		this.onSynchronized?.(this.clientId, messages);
		return messages;
	}

	/** Resolves every pending submission without automatically resubmitting it. */
	public async recoverPending(): Promise<ReadonlyMap<number, SubmissionResolution>> {
		const resolutions = new Map<number, SubmissionResolution>();
		for (const [sequenceNumber, pending] of this.pending) {
			const resolution = await this.client.resolveSubmission(
				this.document,
				this.lifecycle.writer,
				this.lifecycle.session,
				pending.identity,
			);
			resolutions.set(sequenceNumber, resolution);
			if (resolution.kind === "committed") {
				this.lifecycle.lastPosition = resolution.position;
				this.pending.delete(sequenceNumber);
			}
		}
		if (this.pending.size === 0) {
			this.submitChain = Promise.resolve();
		}
		return resolutions;
	}

	/** Explicitly resubmits one authoritatively not-committed pending message. */
	public async resubmitPending(sequenceNumber: number): Promise<void> {
		const pending = this.pending.get(sequenceNumber);
		if (pending === undefined) {
			throw new Error(`no pending submission ${sequenceNumber}`);
		}
		const position = await this.protocol.submit(
			this.document,
			this.lifecycle.writer,
			this.lifecycle.session,
			pending.identity,
			sequenceNumber,
			encoder.encode(JSON.stringify(pending.message)),
			this.lifecycle.lastPosition,
		);
		this.lifecycle.lastPosition = position;
		this.pending.delete(sequenceNumber);
		if (this.pending.size === 0) {
			this.submitChain = Promise.resolve();
		}
	}

	/** Disconnects transport resources while preserving recoverable lifecycle state. */
	public disconnect(): void {
		void Promise.all([this.stopSubscription(), this.stopSubmissionStream()]);
		this.client.disconnect();
		this.emit("disconnect", new Error("explicit disconnect"));
	}

	/** Reconnects the generated client and replaces its streams and subscription. */
	public async reconnect(...args: readonly unknown[]): Promise<void> {
		await Promise.all([this.stopSubscription(), this.stopSubmissionStream()]);
		await this.client.reconnect(...args);
		this.submissionWriteChain = Promise.resolve();
		await this.open();
	}

	/** Synchronously marks the Fluid connection disposed and starts resource cleanup. */
	public dispose(error?: Error): void {
		if (!this.disposed) {
			this.disposed = true;
			void Promise.all([this.stopSubscription(), this.stopSubmissionStream()]);
			this.emit(
				"disconnect",
				error ?? Object.assign(new Error("delta connection disposed"), { canRetry: true }),
			);
		}
	}

	/** Pumps projected operations until cancellation, replacement, or failure. */
	private async consumeSubscription(
		subscription: ProjectedOperationSubscription,
	): Promise<void> {
		try {
			while (!this.disposed && this.subscription === subscription) {
				const operations =
					subscription.nextBatch === undefined
						? [await subscription.next()]
						: await subscription.nextBatch(
								this.subscriptionBatchMaxOperations,
								this.subscriptionBatchMaxPayloadBytes,
							);
				if (this.disposed || this.subscription !== subscription) {
					return;
				}
				if (operations.length === 0) {
					throw new Error("projected subscription returned an empty batch");
				}
				const messages = operations.map((operation) => {
					this.lifecycle.cursor = operation.position;
					if (
						bytesEqual(operation.writer, this.lifecycle.writer) &&
						bytesEqual(operation.session, this.lifecycle.session)
					) {
						this.pending.delete(Number(operation.localSequenceNumber));
					}
					return projectOperation(this.lifecycle, operation);
				});
				this.subscriptionBatchCount++;
				this.peakSubscriptionBatchOperations = Math.max(
					this.peakSubscriptionBatchOperations,
					messages.length,
				);
				this.checkpointSequenceNumber = messages.at(-1)?.sequenceNumber ?? 0;
				this.emit("op", decoder.decode(this.document), messages);
				this.onSynchronized?.(this.clientId, messages);
			}
		} catch (error) {
			if (!this.disposed && this.subscription === subscription) {
				this.onSynchronizationError?.(error);
				this.emit("disconnect", error);
			}
		}
	}

	/** Cancels and drains the current projected subscription. */
	private async stopSubscription(): Promise<void> {
		const subscription = this.subscription;
		this.subscription = undefined;
		if (subscription !== undefined) {
			await subscription.cancel();
		}
		await this.subscriptionPump;
		this.subscriptionPump = undefined;
	}

	/** Closes the current ordered submission stream. */
	private async stopSubmissionStream(): Promise<void> {
		const submissionStream = this.submissionStream;
		this.submissionStream = undefined;
		if (submissionStream !== undefined) {
			await submissionStream.close();
		}
	}
}

/** Creates a generated or injected protocol client for one logical Fluid client. */
export type WasmClientFactory = (
	resolvedUrl: IResolvedUrl,
	clientId: string,
) => Promise<WasmProtocolClient>;

/** Optional observability hooks for the minimal driver harness. */
export interface MinimalWasmDriverOptions {
	/** Receives projected-subscription failures before Fluid is disconnected. */
	readonly onSynchronizationError?: (error: unknown) => void;
	/** Receives each explicit or subscription-driven projected message batch. */
	readonly onSynchronized?: (
		clientId: string,
		messages: readonly ISequencedDocumentMessage[],
	) => void;
	/** Receives each opened delta connection for lifecycle probes. */
	readonly onDeltaConnection?: (connection: MinimalWasmDeltaConnection) => void;
	/** Maximum operations delivered in one projected-subscription event. */
	readonly subscriptionBatchMaxOperations?: number;
	/** Maximum aggregate operation payload bytes delivered in one subscription event. */
	readonly subscriptionBatchMaxPayloadBytes?: number;
}

/** Document-scoped Fluid service sharing one serialized generated client and lifecycle. */
export class MinimalWasmDocumentService extends Events implements IDocumentService {
	/** Registers a Fluid document-service event listener. */
	public readonly on = this.addListener as unknown as IEventTransformer<
		this,
		IDocumentServiceEvents
	>;
	/** Registers a one-shot Fluid document-service event listener. */
	public readonly once = this.onceListener as unknown as IEventTransformer<
		this,
		IDocumentServiceEvents
	>;
	/** Removes a Fluid document-service event listener. */
	public readonly off = this.removeListener as unknown as IEventTransformer<
		this,
		IDocumentServiceEvents
	>;
	/** Requests protocol-tree summarization from Fluid's runtime. */
	public readonly policies = { summarizeProtocolTree: true };
	/** Resolved serialized client after successful creation. */
	private client: WasmProtocolClient | undefined;
	/** In-flight or completed serialized client creation. */
	private clientPromise: Promise<WasmProtocolClient> | undefined;
	/** Lifecycle state shared by read and write delta connections. */
	private deltaLifecycle: DeltaConnectionLifecycle | undefined;

	/** Creates a document service whose Fluid interfaces share one generated client. */
	public constructor(
		public readonly resolvedUrl: IResolvedUrl,
		private readonly clientFactory: WasmClientFactory,
		private readonly options: MinimalWasmDriverOptions,
	) {
		super();
	}

	/** Connects the content-addressed storage adapter. */
	public async connectToStorage(): Promise<MinimalWasmStorage> {
		const client = await this.getClient("storage");
		return new MinimalWasmStorage(
			documentId(this.resolvedUrl),
			client,
			new ProtocolClient(client),
		);
	}

	/** Connects bounded projected-operation history. */
	public async connectToDeltaStorage(): Promise<MinimalWasmDeltaStorage> {
		const client = await this.getClient("history");
		const lifecycle = this.getDeltaLifecycle("read");
		return new MinimalWasmDeltaStorage(client, documentId(this.resolvedUrl), (operation) =>
			projectOperation(lifecycle, operation),
		);
	}

	/** Opens a delta connection, preserving lifecycle across read-to-write replacement. */
	public async connectToDeltaStream(client: IClient): Promise<MinimalWasmDeltaConnection> {
		const mode = client.mode ?? "write";
		const lifecycle = this.getDeltaLifecycle(mode);
		const logicalClientId = lifecycle.clientId;
		const clientId = mode === "read" ? `client-${crypto.randomUUID()}` : logicalClientId;
		const wasm = await this.getClient(clientId);
		const connection = new MinimalWasmDeltaConnection(
			clientId,
			lifecycle,
			documentId(this.resolvedUrl),
			wasm,
			new ProtocolClient(wasm),
			client,
			mode,
			[{ clientId, client }],
			this.options.onSynchronizationError,
			this.options.onSynchronized,
			this.options.subscriptionBatchMaxOperations,
			this.options.subscriptionBatchMaxPayloadBytes,
		);
		await connection.open();
		this.options.onDeltaConnection?.(connection);
		return connection;
	}

	/** Disconnects the shared generated client. */
	public dispose(): void {
		this.client?.disconnect();
	}

	/** Creates this service's document before initial summary upload. */
	public async createDocument(): Promise<void> {
		const client = await this.getClient("create");
		await new ProtocolClient(client).create(documentId(this.resolvedUrl));
	}

	/** Lazily creates the one serialized generated client shared by this service. */
	private getClient(clientId: string): Promise<WasmProtocolClient> {
		this.clientPromise ??= this.clientFactory(this.resolvedUrl, clientId).then((inner) => {
			const client = new SerializedWasmProtocolClient(inner);
			this.client = client;
			return client;
		});
		return this.clientPromise;
	}

	/** Creates or returns lifecycle state retained across delta connections. */
	private getDeltaLifecycle(mode: ConnectionMode): DeltaConnectionLifecycle {
		if (this.deltaLifecycle === undefined) {
			const clientId = mode === "read" ? remoteClientId : `client-${crypto.randomUUID()}`;
			this.deltaLifecycle = {
				clientId,
				remoteClientId: clientId === remoteClientId ? externalClientId : remoteClientId,
				writer: encoder.encode(clientId),
				session: encoder.encode(`${clientId}-${crypto.randomUUID()}`),
				cursor: undefined,
				lastPosition: undefined,
				remoteClientSequenceNumber: 0,
				remoteSequenceNumbers: new Map(),
			};
		}
		return this.deltaLifecycle;
	}
}

/** Fluid document-service factory backed by generated or injected WASM clients. */
export class MinimalWasmDocumentServiceFactory implements IDocumentServiceFactory {
	/** Creates a factory with optional lifecycle observability hooks. */
	public constructor(
		private readonly clientFactory: WasmClientFactory,
		private readonly options: MinimalWasmDriverOptions = {},
	) {}

	/** Creates a document and uploads its optional initial full summary. */
	public async createContainer(
		createNewSummary: ISummaryTree | undefined,
		resolvedUrl: IResolvedUrl,
		_logger?: ITelemetryBaseLogger,
		_clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		const service = new MinimalWasmDocumentService(
			resolvedUrl,
			this.clientFactory,
			this.options,
		);
		await service.createDocument();
		const storage = await service.connectToStorage();
		if (createNewSummary !== undefined) {
			await storage.uploadInitialSummary(createNewSummary);
		}
		return service;
	}

	/** Creates a service for an existing resolved document URL. */
	public async createDocumentService(
		resolvedUrl: IResolvedUrl,
		_logger?: ITelemetryBaseLogger,
		_clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return new MinimalWasmDocumentService(resolvedUrl, this.clientFactory, this.options);
	}
}
