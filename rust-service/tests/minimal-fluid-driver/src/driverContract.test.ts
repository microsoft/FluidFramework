/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

import type {
	IClient,
	IDocumentMessage,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";

import {
	type MinimalWasmDeltaConnection,
	type MinimalWasmDocumentService,
	MinimalWasmDocumentServiceFactory,
} from "./fluidDriver.js";
import { concat, field, frame, optionalField, parseFrame, reference, u64 } from "./fsp4.js";
import type { WasmProtocolClient } from "./wasmClient.js";

/** UTF-8 encoder used for fixture identities and payloads. */
const encoder = new TextEncoder();
/** UTF-8 decoder used to assert retrieved snapshot contents. */
const decoder = new TextDecoder();
/** CommonJS loader used to import the generated WASM package at runtime. */
const require = createRequire(import.meta.url);

/** Generated injected-client constructor loaded from the ignored WASM package. */
interface GeneratedPackage {
	/** Creates a generated client over the in-memory contract transport. */
	readonly InjectedClient: new (
		transport: Transport,
		maxFrameBytes: number,
	) => WasmProtocolClient;
}

/** Canonical operation retained by the in-memory FSP4 contract service. */
interface StoredOperation {
	/** Opaque service position assigned at commit. */
	readonly position: Uint8Array;
	/** Monotonic document sequence number assigned at commit. */
	readonly sequenceNumber: bigint;
	/** Writer identity supplied by the submission. */
	readonly writer: Uint8Array;
	/** Session identity supplied by the submission. */
	readonly session: Uint8Array;
	/** Submission identity used for idempotent resolution. */
	readonly submission: Uint8Array;
	/** Writer-local ordering number supplied by the submission. */
	readonly localSequenceNumber: bigint;
	/** Optional opaque reference position supplied by the writer. */
	readonly reference?: Uint8Array;
	/** Uninterpreted Fluid operation payload. */
	readonly payload: Uint8Array;
}

/** Sequential decoder for the bounded FSP4 fixture fields used by the contract service. */
class Reader {
	/** Current byte offset within the frame body. */
	private offset = 0;

	/** Creates a reader positioned at the first byte of a frame body. */
	public constructor(private readonly bytes: Uint8Array) {}

	/** Reads one byte and advances the cursor. */
	public byte(): number {
		const value = this.bytes[this.offset++];
		assert(value !== undefined);
		return value;
	}

	/** Reads one big-endian 32-bit unsigned integer. */
	public u32(): number {
		const value = new DataView(
			this.bytes.buffer,
			this.bytes.byteOffset + this.offset,
			4,
		).getUint32(0);
		this.offset += 4;
		return value;
	}

	/** Reads one big-endian 64-bit unsigned integer. */
	public u64(): bigint {
		const value = new DataView(
			this.bytes.buffer,
			this.bytes.byteOffset + this.offset,
			8,
		).getBigUint64(0);
		this.offset += 8;
		return value;
	}

	/** Reads one length-prefixed byte field. */
	public field(): Uint8Array {
		const length = this.u32();
		const value = this.bytes.slice(this.offset, this.offset + length);
		this.offset += length;
		return value;
	}

	/** Reads an optional length-prefixed byte field. */
	public optionalField(): Uint8Array | undefined {
		return this.byte() === 0 ? undefined : this.field();
	}

	/** Reads one fixed-width SHA-256 digest. */
	public digest(): Uint8Array {
		const value = this.bytes.slice(this.offset, this.offset + 32);
		this.offset += 32;
		return value;
	}
}

/** Converts opaque bytes to a stable map key. */
function key(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("hex");
}

/** Computes the content identity used by blob and summary fixture storage. */
function digest(payload: Uint8Array): Uint8Array {
	return new Uint8Array(createHash("sha256").update(payload).digest());
}

/** In-memory FSP4 service that exercises the generated client's driver contract. */
class ContractService {
	/** Committed operations in projected sequence order. */
	public readonly operations: StoredOperation[] = [];
	/** Waiters notified when an operation commits or a subscription is cancelled. */
	private readonly operationListeners = new Set<() => void>();
	/** Immutable blob payloads keyed by digest. */
	private readonly blobs = new Map<string, Uint8Array>();
	/** Published summary entries keyed by summary digest. */
	private readonly summaries = new Map<
		string,
		readonly { path: Uint8Array; blob: Uint8Array }[]
	>();
	/** Committed operations keyed by writer, session, and submission identity. */
	private readonly submissions = new Map<string, StoredOperation>();
	/** Most recently published snapshot envelope. */
	private latestSnapshot: { id: Uint8Array; payload: Uint8Array } | undefined;

	/** Routes one unary FSP4 request to the corresponding fixture operation. */
	public request(request: Uint8Array): Uint8Array {
		const parsed = parseFrame(request);
		const requestId = new DataView(request.buffer, request.byteOffset + 8, 8).getBigUint64(0);
		const reader = new Reader(parsed.body);
		switch (parsed.kind) {
			case 1:
				reader.field();
				return frame(requestId, 64, new Uint8Array([1]));
			case 2:
				return frame(requestId, 64, new Uint8Array([2]));
			case 3:
				return this.submit(requestId, reader);
			case 5:
				return this.latest(requestId);
			case 6:
				return this.publishSnapshot(requestId, reader);
			case 8:
				return this.readProjected(requestId, reader);
			case 9:
				return this.resolve(requestId, reader);
			case 10:
				return this.uploadBlob(requestId, reader);
			case 11:
				return this.fetchBlob(requestId, reader);
			case 12:
				return this.publishSummary(requestId, reader);
			case 13:
				return this.fetchSummary(requestId, reader);
			default:
				throw new Error(`unsupported fixture request ${parsed.kind}`);
		}
	}

	/** Commits a new submission once and returns its stable disposition. */
	private submit(requestId: bigint, reader: Reader): Uint8Array {
		reader.field();
		const writer = reader.field();
		const session = reader.field();
		const submission = reader.field();
		const localSequenceNumber = reader.u64();
		const referencePosition = reader.optionalField();
		const payload = reader.field();
		const identity = `${key(writer)}:${key(session)}:${key(submission)}`;
		let operation = this.submissions.get(identity);
		let disposition = 2;
		if (operation === undefined) {
			disposition = 1;
			operation = {
				position: encoder.encode(`position-${this.operations.length + 1}`),
				sequenceNumber: BigInt(this.operations.length + 1),
				writer,
				session,
				submission,
				localSequenceNumber,
				payload,
				...(referencePosition === undefined ? {} : { reference: referencePosition }),
			};
			this.operations.push(operation);
			this.submissions.set(identity, operation);
			for (const listener of this.operationListeners) {
				listener();
			}
		}
		assert(operation !== undefined);
		return frame(
			requestId,
			65,
			new Uint8Array([disposition]),
			field(operation.position),
			u64(operation.sequenceNumber),
			reference(operation.position),
		);
	}

	/** Returns projected operations strictly after the requested cursor. */
	private readProjected(requestId: bigint, reader: Reader): Uint8Array {
		reader.field();
		const after = reader.optionalField();
		const start =
			after === undefined
				? 0
				: this.operations.findIndex(({ position }) => key(position) === key(after)) + 1;
		const operations = this.operations.slice(start);
		return frame(
			requestId,
			68,
			new Uint8Array([0, 0, 0, operations.length]),
			...operations.map((operation) =>
				concat(
					field(operation.position),
					u64(operation.sequenceNumber),
					reference(operation.position),
					field(operation.writer),
					field(operation.session),
					field(operation.submission),
					u64(operation.localSequenceNumber),
					reference(operation.reference),
					field(operation.payload),
				),
			),
			optionalField(operations.at(-1)?.position ?? after),
			new Uint8Array([0]),
		);
	}

	/** Resolves a submission identity as committed or not committed. */
	private resolve(requestId: bigint, reader: Reader): Uint8Array {
		reader.field();
		const writer = reader.field();
		const session = reader.field();
		const submission = reader.field();
		const operation = this.submissions.get(
			`${key(writer)}:${key(session)}:${key(submission)}`,
		);
		return operation === undefined
			? frame(requestId, 69, new Uint8Array([2]))
			: frame(
					requestId,
					69,
					new Uint8Array([1]),
					field(operation.position),
					u64(operation.sequenceNumber),
					reference(operation.position),
				);
	}

	/** Stores an immutable blob and reports content deduplication. */
	private uploadBlob(requestId: bigint, reader: Reader): Uint8Array {
		const payload = reader.field();
		const identity = digest(payload);
		const deduplicated = this.blobs.has(key(identity));
		this.blobs.set(key(identity), payload);
		return frame(
			requestId,
			70,
			identity,
			u64(payload.length),
			new Uint8Array([Number(deduplicated)]),
		);
	}

	/** Fetches an uploaded blob by its fixed-width digest. */
	private fetchBlob(requestId: bigint, reader: Reader): Uint8Array {
		const identity = reader.digest();
		const payload = this.blobs.get(key(identity));
		assert(payload !== undefined);
		return frame(requestId, 71, identity, field(payload));
	}

	/** Publishes a summary manifest under its content digest. */
	private publishSummary(requestId: bigint, reader: Reader): Uint8Array {
		const count = reader.u32();
		const entries = Array.from({ length: count }, () => ({
			path: reader.field(),
			blob: reader.digest(),
		}));
		const identity = digest(
			concat(...entries.flatMap((entry) => [field(entry.path), entry.blob])),
		);
		const deduplicated = this.summaries.has(key(identity));
		this.summaries.set(key(identity), entries);
		return frame(
			requestId,
			72,
			identity,
			new Uint8Array([0, 0, 0, count]),
			u64(0),
			new Uint8Array([Number(deduplicated)]),
		);
	}

	/** Fetches a published summary manifest by digest. */
	private fetchSummary(requestId: bigint, reader: Reader): Uint8Array {
		const identity = reader.digest();
		const entries = this.summaries.get(key(identity));
		assert(entries !== undefined);
		return frame(
			requestId,
			73,
			identity,
			new Uint8Array([0, 0, 0, entries.length]),
			...entries.map((entry) => concat(field(entry.path), entry.blob)),
		);
	}

	/** Replaces the latest full snapshot retained by the fixture. */
	private publishSnapshot(requestId: bigint, reader: Reader): Uint8Array {
		reader.field();
		reader.optionalField();
		reader.optionalField();
		const payload = reader.field();
		this.latestSnapshot = { id: encoder.encode(`snapshot-${key(payload)}`), payload };
		return frame(requestId, 64, new Uint8Array([3]));
	}

	/** Returns the latest snapshot or an explicit missing result. */
	private latest(requestId: bigint): Uint8Array {
		return this.latestSnapshot === undefined
			? frame(requestId, 67, new Uint8Array([0]))
			: frame(
					requestId,
					67,
					new Uint8Array([1]),
					field(this.latestSnapshot.id),
					reference(),
					field(this.latestSnapshot.payload),
				);
	}

	/** Waits for the operation at an index unless the subscription is cancelled. */
	public async operationAt(index: number, cancelled: () => boolean): Promise<StoredOperation> {
		while (!cancelled()) {
			const operation = this.operations[index];
			if (operation !== undefined) {
				return operation;
			}
			await new Promise<void>((resolve) => {
				const listener = (): void => {
					this.operationListeners.delete(listener);
					resolve();
				};
				this.operationListeners.add(listener);
			});
		}
		throw new Error("subscription cancelled");
	}

	/** Wakes projected-operation subscriptions after commit or cancellation. */
	public wakeSubscriptions(): void {
		for (const listener of this.operationListeners) {
			listener();
		}
	}
}

/** Cursor-bearing projected-operation subscription for the contract fixture. */
class ContractSubscription {
	/** Whether cancellation should abort the next pending read. */
	private cancelled = false;
	/** Index of the next projected operation to return. */
	private index: number;

	/** Starts after the supplied cursor, or at the beginning when it is absent. */
	public constructor(
		private readonly service: ContractService,
		private readonly requestId: bigint,
		after: Uint8Array | undefined,
	) {
		this.index =
			after === undefined
				? 0
				: service.operations.findIndex(({ position }) => key(position) === key(after)) + 1;
	}

	/** Returns the next committed operation as a subscription frame. */
	public async next(): Promise<Uint8Array> {
		const operation = await this.service.operationAt(this.index, () => this.cancelled);
		this.index++;
		return frame(
			this.requestId,
			74,
			field(operation.position),
			u64(operation.sequenceNumber),
			reference(operation.position),
			field(operation.writer),
			field(operation.session),
			field(operation.submission),
			u64(operation.localSequenceNumber),
			reference(operation.reference),
			field(operation.payload),
		);
	}

	/** Cancels pending reads and wakes the service waiter. */
	public cancel(): void {
		this.cancelled = true;
		this.service.wakeSubscriptions();
	}
}

/** Disconnectable injected transport with deterministic response-loss injection. */
class Transport {
	/** Whether requests and subscriptions may currently reach the fixture service. */
	public connected = true;
	/** Whether the next submit response is lost after the service commits it. */
	public failAfterCommit = false;

	/** Creates a transport over one shared contract service. */
	public constructor(private readonly service: ContractService) {}

	/** Executes a unary request and optionally injects post-commit response loss. */
	public async request(request: Uint8Array): Promise<Uint8Array> {
		if (!this.connected) {
			throw new Error("transport disconnected");
		}
		const response = this.service.request(request);
		if (this.failAfterCommit && parseFrame(request).kind === 3) {
			this.failAfterCommit = false;
			throw new Error("response lost after commit");
		}
		return response;
	}

	/** Opens a projected-operation subscription from the request cursor. */
	public subscribe(request: Uint8Array): ContractSubscription {
		if (!this.connected) {
			throw new Error("transport disconnected");
		}
		const parsed = parseFrame(request);
		assert.equal(parsed.kind, 14);
		const requestId = new DataView(request.buffer, request.byteOffset + 8, 8).getBigUint64(0);
		const reader = new Reader(parsed.body);
		reader.field();
		return new ContractSubscription(this.service, requestId, reader.optionalField());
	}

	/** Rejects subsequent requests and subscriptions on this transport. */
	public disconnect(): void {
		this.connected = false;
	}
}

test("actual WASM package backs the minimal Fluid driver contract", async () => {
	const generated =
		require("../../wasm-client/pkg/fluid_webtransport_browser.js") as GeneratedPackage;
	const backend = new ContractService();
	const transports: Transport[] = [];
	const factory = new MinimalWasmDocumentServiceFactory(async () => {
		const transport = new Transport(backend);
		transports.push(transport);
		return new generated.InjectedClient(transport, 1024 * 1024);
	});
	const resolvedUrl: IResolvedUrl = {
		type: "fluid",
		id: "contract-document",
		url: "fluid://minimal/contract-document",
		tokens: {},
		endpoints: {},
	};
	const summary = {
		type: 1 as const,
		tree: { counter: { type: 2 as const, content: "0" } },
	};
	await factory.createContainer(summary, resolvedUrl);
	const loaded = (await factory.createDocumentService(
		resolvedUrl,
	)) as MinimalWasmDocumentService;
	const storage = await loaded.connectToStorage();
	const snapshot = await storage.getSnapshotTree();
	assert(snapshot !== null);
	assert.equal(decoder.decode(await storage.readBlob(snapshot.blobs.counter ?? "")), "0");

	const first = (await loaded.connectToDeltaStream(
		{} as IClient,
	)) as MinimalWasmDeltaConnection;
	const secondService = (await factory.createDocumentService(
		resolvedUrl,
	)) as MinimalWasmDocumentService;
	const second = (await secondService.connectToDeltaStream({
		mode: "read",
	} as IClient)) as MinimalWasmDeltaConnection;
	assert.equal(first.mode, "write");
	assert.equal(second.mode, "read");
	assert.equal(second.initialMessages.filter(({ type }) => type === "join").length, 2);
	const readJoin = second.initialMessages[0];
	assert(readJoin !== undefined);
	assert.equal(JSON.parse(readJoin.data ?? "").detail.mode, "write");
	second.dispose();
	const replacement = (await secondService.connectToDeltaStream({
		mode: "write",
	} as IClient)) as MinimalWasmDeltaConnection;
	assert.equal(replacement.mode, "write");
	assert.notEqual(replacement.clientId, second.clientId);
	assert.equal(replacement.clientId, "remote-service-client");
	const message = (clientSequenceNumber: number, delta: number): IDocumentMessage => ({
		clientSequenceNumber,
		referenceSequenceNumber: 0,
		type: "op",
		contents: { delta },
	});
	const firstMessages: { clientSequenceNumber: number }[] = [];
	const secondMessages: { clientSequenceNumber: number }[] = [];
	first.on("op", (_documentId, messages) => {
		firstMessages.push(...messages);
	});
	replacement.on("op", (_documentId, messages) => {
		secondMessages.push(...messages);
	});
	first.submit([message(1, 1)]);
	replacement.submit([message(2, 20)]);
	replacement.submit([message(1, 2)]);
	await Promise.all([first.waitForIdle(), replacement.waitForIdle()]);
	assert.deepEqual(
		backend.operations.map(({ localSequenceNumber }) => localSequenceNumber),
		[1n, 1n, 2n],
	);
	await waitUntil(() => firstMessages.length === 3 && secondMessages.length === 3);
	assert.deepEqual(
		firstMessages.map(({ clientSequenceNumber }) => clientSequenceNumber),
		[1, 1, 2],
	);
	assert.deepEqual(
		secondMessages.map(({ clientSequenceNumber }) => clientSequenceNumber),
		[1, 1, 2],
	);

	first.disconnect();
	first.submit([message(2, 4)]);
	await assert.rejects(first.waitForIdle(), /disconnected/);
	await first.reconnect(new Transport(backend));
	assert.equal((await first.recoverPending()).get(2)?.kind, "notCommitted");
	await first.resubmitPending(2);

	const ambiguousTransport = new Transport(backend);
	ambiguousTransport.failAfterCommit = true;
	first.disconnect();
	await first.reconnect(ambiguousTransport);
	first.submit([message(3, 8)]);
	await assert.rejects(first.waitForIdle(), /response lost after commit/);
	await waitUntil(() => firstMessages.length === 5);
	assert.equal(first.pending.has(3), false);
	first.disconnect();
	await first.reconnect(new Transport(backend));
	assert.equal((await first.recoverPending()).has(3), false);
	assert.equal(backend.operations.length, 5);

	const history = await loaded.connectToDeltaStorage();
	const page = await history.fetchMessages(2, 4).read();
	assert.equal(page.done, false);
	if (!page.done) {
		assert.deepEqual(
			page.value.map(({ sequenceNumber }) => sequenceNumber),
			[3],
		);
	}
	assert.equal(
		transports.every((transport) => transport instanceof Transport),
		true,
	);
});

/** Polls until pushed operations satisfy the contract assertion. */
async function waitUntil(check: () => boolean): Promise<void> {
	const deadline = Date.now() + 2_000;
	while (!check()) {
		if (Date.now() >= deadline) {
			throw new Error("timed out waiting for pushed operations");
		}
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}
