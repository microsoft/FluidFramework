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
	SubmissionResolution,
	SummaryEntry,
	WasmProtocolClient,
} from "./wasmClient.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const summaryType = { tree: 1, blob: 2 } as const;
const remoteClientId = "remote-service-client";
const externalClientId = "external-service-client";
const applicationSequenceOffset = 2;

type Listener = (...args: readonly unknown[]) => void;

class SerializedWasmProtocolClient implements WasmProtocolClient {
	private tail: Promise<void> = Promise.resolve();

	public constructor(private readonly inner: WasmProtocolClient) {}

	public request(frame: Uint8Array): Promise<Uint8Array> {
		return this.enqueue(async () => this.inner.request(frame));
	}

	public readProjected(document: Uint8Array, after?: Uint8Array) {
		return this.enqueue(async () => this.inner.readProjected(document, after));
	}

	public subscribeProjected(document: Uint8Array, after?: Uint8Array) {
		return this.enqueue(async () => this.inner.subscribeProjected(document, after));
	}

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

	public uploadBlob(payload: Uint8Array) {
		return this.enqueue(async () => this.inner.uploadBlob(payload));
	}

	public fetchBlob(digest: Uint8Array) {
		return this.enqueue(async () => this.inner.fetchBlob(digest));
	}

	public publishSummary(entries: readonly SummaryEntry[]) {
		return this.enqueue(async () => this.inner.publishSummary(entries));
	}

	public fetchSummary(digest: Uint8Array) {
		return this.enqueue(async () => this.inner.fetchSummary(digest));
	}

	public disconnect(): void {
		this.inner.disconnect();
	}

	public reconnect(...args: readonly unknown[]): Promise<void> {
		return this.enqueue(async () => this.inner.reconnect(...args));
	}

	public get wireBytes(): bigint {
		return this.inner.wireBytes;
	}

	public get peakResponseBytes(): number {
		return this.inner.peakResponseBytes;
	}

	public get peakSubscriptionFrameBytes(): number {
		return this.inner.peakSubscriptionFrameBytes;
	}

	public get peakSubscriptionQueueDepth(): number {
		return this.inner.peakSubscriptionQueueDepth;
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.tail.then(operation, operation);
		this.tail = result.then(
			() => {},
			() => {},
		);
		return result;
	}
}

class Events {
	private readonly listeners = new Map<string, Set<Listener>>();

	protected addListener(event: string, listener: Listener): this {
		const listeners = this.listeners.get(event) ?? new Set<Listener>();
		listeners.add(listener);
		this.listeners.set(event, listeners);
		return this;
	}

	protected onceListener(event: string, listener: Listener): this {
		const once = (...args: readonly unknown[]): void => {
			this.removeListener(event, once);
			listener(...args);
		};
		return this.addListener(event, once);
	}

	protected removeListener(event: string, listener: Listener): this {
		this.listeners.get(event)?.delete(listener);
		return this;
	}

	protected emit(event: string, ...args: readonly unknown[]): void {
		for (const listener of this.listeners.get(event) ?? []) {
			listener(...args);
		}
	}
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
	if (!/^[0-9a-f]{64}$/u.test(value)) {
		throw new Error(`invalid content digest: ${value}`);
	}
	return Uint8Array.from(value.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
}

function documentId(resolvedUrl: IResolvedUrl): Uint8Array {
	return encoder.encode(resolvedUrl.id);
}

interface UploadedSummary {
	readonly digest: Uint8Array;
	readonly entries: readonly SummaryEntry[];
}

export class MinimalWasmStorage implements IDocumentStorageService {
	public readonly policies = { maximumCacheDurationMs: 432_000_000 as const };

	public constructor(
		private readonly document: Uint8Array,
		private readonly client: WasmProtocolClient,
		private readonly protocol: ProtocolClient,
	) {}

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

	public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
		const versions = version === undefined ? await this.getVersions(null, 1) : [version];
		const selected = versions[0];
		if (selected === undefined) {
			return null;
		}
		const entries = await this.client.fetchSummary(hexToBytes(selected.id));
		return this.snapshotTree(selected.id, entries);
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		const upload = await this.client.uploadBlob(new Uint8Array(file));
		return { id: bytesToHex(upload.digest) };
	}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		return (await this.client.fetchBlob(hexToBytes(id))).slice().buffer;
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		_context: ISummaryContext,
	): Promise<string> {
		const uploaded = await this.uploadSummary(summary);
		await this.protocol.publishSnapshot(this.document, uploaded.digest);
		return bytesToHex(uploaded.digest);
	}

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

	public dispose(): void {}

	public async uploadInitialSummary(summary: ISummaryTree): Promise<void> {
		const uploaded = await this.uploadSummary(summary);
		await this.protocol.publishSnapshot(this.document, uploaded.digest);
	}

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

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

class ProjectedMessageStream implements IStream<ISequencedDocumentMessage[]> {
	private cursor: Uint8Array | undefined;
	private done = false;

	public constructor(
		private readonly client: WasmProtocolClient,
		private readonly document: Uint8Array,
		private readonly from: number,
		private readonly to: number | undefined,
		private readonly project: (operation: ProjectedOperation) => ISequencedDocumentMessage,
	) {}

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

export class MinimalWasmDeltaStorage implements IDocumentDeltaStorageService {
	public constructor(
		private readonly client: WasmProtocolClient,
		private readonly document: Uint8Array,
		private readonly project: (
			operation: ProjectedOperation,
		) => ISequencedDocumentMessage = toSequenced,
	) {}

	public fetchMessages(
		from: number,
		to: number | undefined,
	): IStream<ISequencedDocumentMessage[]> {
		return new ProjectedMessageStream(this.client, this.document, from, to, this.project);
	}
}

interface PendingSubmission {
	readonly identity: Uint8Array;
	readonly message: IDocumentMessage;
}

interface DeltaConnectionLifecycle {
	readonly clientId: string;
	readonly remoteClientId: string;
	readonly writer: Uint8Array;
	readonly session: Uint8Array;
	cursor: Uint8Array | undefined;
	lastPosition: Uint8Array | undefined;
	remoteClientSequenceNumber: number;
	readonly remoteSequenceNumbers: Map<string, number>;
}

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

export class MinimalWasmDeltaConnection extends Events implements IDocumentDeltaConnection {
	public readonly on = this.addListener as unknown as IEventTransformer<
		this,
		IDocumentDeltaConnectionEvents
	>;
	public readonly once = this.onceListener as unknown as IEventTransformer<
		this,
		IDocumentDeltaConnectionEvents
	>;
	public readonly off = this.removeListener as unknown as IEventTransformer<
		this,
		IDocumentDeltaConnectionEvents
	>;
	public readonly claims: ITokenClaims;
	public readonly existing = true;
	public readonly version = "^0.1.0";
	public readonly initialMessages: ISequencedDocumentMessage[];
	public readonly initialSignals: ISignalMessage[] = [];
	public readonly serviceConfiguration = {} as IClientConfiguration;
	public checkpointSequenceNumber = 0;
	public readonly pending = new Map<number, PendingSubmission>();
	private readonly queuedSubmissions = new Map<number, PendingSubmission>();
	private nextClientSequenceNumber = 1;
	private submitChain: Promise<void> = Promise.resolve();
	private subscription: ProjectedOperationSubscription | undefined;
	private subscriptionPump: Promise<void> | undefined;
	public disposed = false;

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

	public async open(): Promise<void> {
		await this.protocol.openSession(
			this.document,
			this.lifecycle.writer,
			this.lifecycle.session,
			this.lifecycle.lastPosition,
		);
		this.subscription = await this.client.subscribeProjected(
			this.document,
			this.lifecycle.cursor,
		);
		this.subscriptionPump = this.consumeSubscription(this.subscription);
	}

	public submit(messages: IDocumentMessage[]): void {
		for (const message of messages) {
			const identity = encoder.encode(`${this.clientId}-${message.clientSequenceNumber}`);
			const pending = { identity, message };
			this.pending.set(message.clientSequenceNumber, pending);
			this.queuedSubmissions.set(message.clientSequenceNumber, pending);
		}
		this.scheduleQueuedSubmissions();
	}

	private scheduleQueuedSubmissions(): void {
		for (;;) {
			const pending = this.queuedSubmissions.get(this.nextClientSequenceNumber);
			if (pending === undefined) {
				return;
			}
			const { identity, message } = pending;
			this.queuedSubmissions.delete(this.nextClientSequenceNumber);
			this.nextClientSequenceNumber++;
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

	public submitSignal(): void {
		throw new Error("signals are unsupported");
	}

	public async waitForIdle(): Promise<void> {
		await this.submitChain;
	}

	public async restartSubscription(): Promise<boolean> {
		const resumedFromCursor = this.lifecycle.cursor !== undefined;
		await this.stopSubscription();
		await this.open();
		return resumedFromCursor;
	}

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

	public disconnect(): void {
		void this.stopSubscription();
		this.client.disconnect();
		this.emit("disconnect", new Error("explicit disconnect"));
	}

	public async reconnect(...args: readonly unknown[]): Promise<void> {
		await this.client.reconnect(...args);
		await this.open();
	}

	public dispose(error?: Error): void {
		if (!this.disposed) {
			this.disposed = true;
			void this.stopSubscription();
			this.emit(
				"disconnect",
				error ?? Object.assign(new Error("delta connection disposed"), { canRetry: true }),
			);
		}
	}

	private async consumeSubscription(
		subscription: ProjectedOperationSubscription,
	): Promise<void> {
		try {
			while (!this.disposed && this.subscription === subscription) {
				const operation = await subscription.next();
				if (this.disposed || this.subscription !== subscription) {
					return;
				}
				this.lifecycle.cursor = operation.position;
				const message = projectOperation(this.lifecycle, operation);
				this.checkpointSequenceNumber = message.sequenceNumber;
				this.emit("op", decoder.decode(this.document), [message]);
				this.onSynchronized?.(this.clientId, [message]);
			}
		} catch (error) {
			if (!this.disposed && this.subscription === subscription) {
				this.onSynchronizationError?.(error);
				this.emit("disconnect", error);
			}
		}
	}

	private async stopSubscription(): Promise<void> {
		const subscription = this.subscription;
		this.subscription = undefined;
		if (subscription !== undefined) {
			await subscription.cancel();
		}
		await this.subscriptionPump;
		this.subscriptionPump = undefined;
	}
}

export type WasmClientFactory = (
	resolvedUrl: IResolvedUrl,
	clientId: string,
) => Promise<WasmProtocolClient>;

export interface MinimalWasmDriverOptions {
	readonly onSynchronizationError?: (error: unknown) => void;
	readonly onSynchronized?: (
		clientId: string,
		messages: readonly ISequencedDocumentMessage[],
	) => void;
	readonly onDeltaConnection?: (connection: MinimalWasmDeltaConnection) => void;
}

export class MinimalWasmDocumentService extends Events implements IDocumentService {
	public readonly on = this.addListener as unknown as IEventTransformer<
		this,
		IDocumentServiceEvents
	>;
	public readonly once = this.onceListener as unknown as IEventTransformer<
		this,
		IDocumentServiceEvents
	>;
	public readonly off = this.removeListener as unknown as IEventTransformer<
		this,
		IDocumentServiceEvents
	>;
	public readonly policies = { summarizeProtocolTree: true };
	private client: WasmProtocolClient | undefined;
	private clientPromise: Promise<WasmProtocolClient> | undefined;
	private deltaLifecycle: DeltaConnectionLifecycle | undefined;

	public constructor(
		public readonly resolvedUrl: IResolvedUrl,
		private readonly clientFactory: WasmClientFactory,
		private readonly options: MinimalWasmDriverOptions,
	) {
		super();
	}

	public async connectToStorage(): Promise<MinimalWasmStorage> {
		const client = await this.getClient("storage");
		return new MinimalWasmStorage(
			documentId(this.resolvedUrl),
			client,
			new ProtocolClient(client),
		);
	}

	public async connectToDeltaStorage(): Promise<MinimalWasmDeltaStorage> {
		const client = await this.getClient("history");
		const lifecycle = this.getDeltaLifecycle("read");
		return new MinimalWasmDeltaStorage(client, documentId(this.resolvedUrl), (operation) =>
			projectOperation(lifecycle, operation),
		);
	}

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
		);
		await connection.open();
		this.options.onDeltaConnection?.(connection);
		return connection;
	}

	public dispose(): void {
		this.client?.disconnect();
	}

	public async createDocument(): Promise<void> {
		const client = await this.getClient("create");
		await new ProtocolClient(client).create(documentId(this.resolvedUrl));
	}

	private getClient(clientId: string): Promise<WasmProtocolClient> {
		this.clientPromise ??= this.clientFactory(this.resolvedUrl, clientId).then((inner) => {
			const client = new SerializedWasmProtocolClient(inner);
			this.client = client;
			return client;
		});
		return this.clientPromise;
	}

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

export class MinimalWasmDocumentServiceFactory implements IDocumentServiceFactory {
	public constructor(
		private readonly clientFactory: WasmClientFactory,
		private readonly options: MinimalWasmDriverOptions = {},
	) {}

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

	public async createDocumentService(
		resolvedUrl: IResolvedUrl,
		_logger?: ITelemetryBaseLogger,
		_clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return new MinimalWasmDocumentService(resolvedUrl, this.clientFactory, this.options);
	}
}
