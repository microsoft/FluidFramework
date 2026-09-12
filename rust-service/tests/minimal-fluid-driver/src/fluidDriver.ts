import type { IEventTransformer, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
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
	SubmissionResolution,
	SummaryEntry,
	WasmProtocolClient,
} from "./wasmClient.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const summaryType = { tree: 1, blob: 2 } as const;

type Listener = (...args: readonly unknown[]) => void;

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
		await this.flattenSummary(summary, "", entries);
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

function toSequenced(operation: ProjectedOperation): ISequencedDocumentMessage {
	const message = JSON.parse(decoder.decode(operation.payload)) as IDocumentMessage;
	return {
		...message,
		clientId: decoder.decode(operation.writer),
		sequenceNumber: Number(operation.sequenceNumber),
		minimumSequenceNumber: Number(operation.sequenceNumber),
		timestamp: 0,
	};
}

class ProjectedMessageStream implements IStream<ISequencedDocumentMessage[]> {
	private cursor: Uint8Array | undefined;
	private done = false;

	public constructor(
		private readonly client: WasmProtocolClient,
		private readonly document: Uint8Array,
		private readonly from: number,
		private readonly to: number | undefined,
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
					Number(sequenceNumber) >= this.from &&
					(this.to === undefined || Number(sequenceNumber) < this.to),
			)
			.map(toSequenced);
		return messages.length === 0 && this.done
			? { done: true }
			: { done: false, value: messages };
	}
}

export class MinimalWasmDeltaStorage implements IDocumentDeltaStorageService {
	public constructor(
		private readonly client: WasmProtocolClient,
		private readonly document: Uint8Array,
	) {}

	public fetchMessages(
		from: number,
		to: number | undefined,
	): IStream<ISequencedDocumentMessage[]> {
		return new ProjectedMessageStream(this.client, this.document, from, to);
	}
}

interface PendingSubmission {
	readonly identity: Uint8Array;
	readonly message: IDocumentMessage;
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
	public readonly claims = {} as ITokenClaims;
	public readonly mode = "write" as ConnectionMode;
	public readonly existing = true;
	public readonly version = "^0.1.0";
	public readonly initialMessages: ISequencedDocumentMessage[] = [];
	public readonly initialSignals: ISignalMessage[] = [];
	public readonly initialClients: ISignalClient[] = [];
	public readonly serviceConfiguration = {} as IClientConfiguration;
	public checkpointSequenceNumber = 0;
	public readonly pending = new Map<number, PendingSubmission>();
	private readonly writer: Uint8Array;
	private readonly session: Uint8Array;
	private cursor: Uint8Array | undefined;
	private lastPosition: Uint8Array | undefined;
	private submitChain: Promise<void> = Promise.resolve();
	public disposed = false;

	public constructor(
		public readonly clientId: string,
		private readonly document: Uint8Array,
		private readonly client: WasmProtocolClient,
		private readonly protocol: ProtocolClient,
	) {
		super();
		this.writer = encoder.encode(clientId);
		this.session = encoder.encode(`${clientId}-${Date.now()}`);
	}

	public async open(): Promise<void> {
		await this.protocol.openSession(
			this.document,
			this.writer,
			this.session,
			this.lastPosition,
		);
	}

	public submit(messages: IDocumentMessage[]): void {
		for (const message of messages) {
			const identity = encoder.encode(`${this.clientId}-${message.clientSequenceNumber}`);
			this.pending.set(message.clientSequenceNumber, { identity, message });
			this.submitChain = this.submitChain.then(async () => {
				const position = await this.protocol.submit(
					this.document,
					this.writer,
					this.session,
					identity,
					message.clientSequenceNumber,
					encoder.encode(JSON.stringify(message)),
					this.lastPosition,
				);
				this.lastPosition = position;
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

	public async synchronize(): Promise<ISequencedDocumentMessage[]> {
		const page = await this.client.readProjected(this.document, this.cursor);
		this.cursor = page.cursor;
		const messages = page.operations.map(toSequenced);
		if (messages.length > 0) {
			this.checkpointSequenceNumber =
				messages.at(-1)?.sequenceNumber ?? this.checkpointSequenceNumber;
			this.emit("op", decoder.decode(this.document), messages);
		}
		return messages;
	}

	public async recoverPending(): Promise<ReadonlyMap<number, SubmissionResolution>> {
		const resolutions = new Map<number, SubmissionResolution>();
		for (const [sequenceNumber, pending] of this.pending) {
			const resolution = await this.client.resolveSubmission(
				this.document,
				this.writer,
				this.session,
				pending.identity,
			);
			resolutions.set(sequenceNumber, resolution);
			if (resolution.kind === "committed") {
				this.lastPosition = resolution.position;
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
			this.writer,
			this.session,
			pending.identity,
			sequenceNumber,
			encoder.encode(JSON.stringify(pending.message)),
			this.lastPosition,
		);
		this.lastPosition = position;
		this.pending.delete(sequenceNumber);
		if (this.pending.size === 0) {
			this.submitChain = Promise.resolve();
		}
	}

	public disconnect(): void {
		this.client.disconnect();
		this.emit("disconnect", new Error("explicit disconnect"));
	}

	public async reconnect(...args: readonly unknown[]): Promise<void> {
		await this.client.reconnect(...args);
		await this.open();
	}

	public dispose(): void {
		if (!this.disposed) {
			this.disposed = true;
			this.client.disconnect();
		}
	}
}

export type WasmClientFactory = (
	resolvedUrl: IResolvedUrl,
	clientId: string,
) => Promise<WasmProtocolClient>;

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
	private readonly clients: WasmProtocolClient[] = [];

	public constructor(
		public readonly resolvedUrl: IResolvedUrl,
		private readonly clientFactory: WasmClientFactory,
	) {
		super();
	}

	public async connectToStorage(): Promise<MinimalWasmStorage> {
		const client = await this.createClient("storage");
		return new MinimalWasmStorage(
			documentId(this.resolvedUrl),
			client,
			new ProtocolClient(client),
		);
	}

	public async connectToDeltaStorage(): Promise<MinimalWasmDeltaStorage> {
		const client = await this.createClient("history");
		return new MinimalWasmDeltaStorage(client, documentId(this.resolvedUrl));
	}

	public async connectToDeltaStream(_client: IClient): Promise<MinimalWasmDeltaConnection> {
		const clientId = `client-${this.clients.length + 1}`;
		const wasm = await this.createClient(clientId);
		const connection = new MinimalWasmDeltaConnection(
			clientId,
			documentId(this.resolvedUrl),
			wasm,
			new ProtocolClient(wasm),
		);
		await connection.open();
		return connection;
	}

	public dispose(): void {
		for (const client of this.clients) {
			client.disconnect();
		}
	}

	private async createClient(clientId: string): Promise<WasmProtocolClient> {
		const client = await this.clientFactory(this.resolvedUrl, clientId);
		this.clients.push(client);
		return client;
	}
}

export class MinimalWasmDocumentServiceFactory implements IDocumentServiceFactory {
	public constructor(private readonly clientFactory: WasmClientFactory) {}

	public async createContainer(
		createNewSummary: ISummaryTree | undefined,
		resolvedUrl: IResolvedUrl,
		_logger?: ITelemetryBaseLogger,
		_clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		const service = new MinimalWasmDocumentService(resolvedUrl, this.clientFactory);
		const storage = await service.connectToStorage();
		const protocol = new ProtocolClient(await this.clientFactory(resolvedUrl, "create"));
		await protocol.create(documentId(resolvedUrl));
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
		return new MinimalWasmDocumentService(resolvedUrl, this.clientFactory);
	}
}
