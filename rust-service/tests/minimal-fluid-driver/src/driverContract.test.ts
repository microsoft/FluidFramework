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

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const require = createRequire(import.meta.url);

interface GeneratedPackage {
	readonly InjectedClient: new (
		transport: Transport,
		maxFrameBytes: number,
	) => WasmProtocolClient;
}

interface StoredOperation {
	readonly position: Uint8Array;
	readonly sequenceNumber: bigint;
	readonly writer: Uint8Array;
	readonly session: Uint8Array;
	readonly submission: Uint8Array;
	readonly localSequenceNumber: bigint;
	readonly reference?: Uint8Array;
	readonly payload: Uint8Array;
}

class Reader {
	private offset = 0;

	public constructor(private readonly bytes: Uint8Array) {}

	public byte(): number {
		const value = this.bytes[this.offset++];
		assert(value !== undefined);
		return value;
	}

	public u32(): number {
		const value = new DataView(
			this.bytes.buffer,
			this.bytes.byteOffset + this.offset,
			4,
		).getUint32(0);
		this.offset += 4;
		return value;
	}

	public u64(): bigint {
		const value = new DataView(
			this.bytes.buffer,
			this.bytes.byteOffset + this.offset,
			8,
		).getBigUint64(0);
		this.offset += 8;
		return value;
	}

	public field(): Uint8Array {
		const length = this.u32();
		const value = this.bytes.slice(this.offset, this.offset + length);
		this.offset += length;
		return value;
	}

	public optionalField(): Uint8Array | undefined {
		return this.byte() === 0 ? undefined : this.field();
	}

	public digest(): Uint8Array {
		const value = this.bytes.slice(this.offset, this.offset + 32);
		this.offset += 32;
		return value;
	}
}

function key(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("hex");
}

function digest(payload: Uint8Array): Uint8Array {
	return new Uint8Array(createHash("sha256").update(payload).digest());
}

class ContractService {
	public readonly operations: StoredOperation[] = [];
	private readonly blobs = new Map<string, Uint8Array>();
	private readonly summaries = new Map<
		string,
		readonly { path: Uint8Array; blob: Uint8Array }[]
	>();
	private readonly submissions = new Map<string, StoredOperation>();
	private latestSnapshot: { id: Uint8Array; payload: Uint8Array } | undefined;

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

	private fetchBlob(requestId: bigint, reader: Reader): Uint8Array {
		const identity = reader.digest();
		const payload = this.blobs.get(key(identity));
		assert(payload !== undefined);
		return frame(requestId, 71, identity, field(payload));
	}

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

	private publishSnapshot(requestId: bigint, reader: Reader): Uint8Array {
		reader.field();
		reader.optionalField();
		reader.optionalField();
		const payload = reader.field();
		this.latestSnapshot = { id: encoder.encode(`snapshot-${key(payload)}`), payload };
		return frame(requestId, 64, new Uint8Array([3]));
	}

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
}

class Transport {
	public connected = true;
	public failAfterCommit = false;

	public constructor(private readonly service: ContractService) {}

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
	const second = (await secondService.connectToDeltaStream(
		{} as IClient,
	)) as MinimalWasmDeltaConnection;
	const message = (clientSequenceNumber: number, delta: number): IDocumentMessage => ({
		clientSequenceNumber,
		referenceSequenceNumber: 0,
		type: "op",
		contents: { delta },
	});
	first.submit([message(1, 1)]);
	second.submit([message(1, 2)]);
	await Promise.all([first.waitForIdle(), second.waitForIdle()]);
	assert.equal((await first.synchronize()).length, 2);
	assert.equal((await second.synchronize()).length, 2);

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
	first.disconnect();
	await first.reconnect(new Transport(backend));
	assert.equal((await first.recoverPending()).get(3)?.kind, "committed");
	assert.equal(backend.operations.length, 4);

	const history = await loaded.connectToDeltaStorage();
	const page = await history.fetchMessages(2, 4).read();
	assert.equal(page.done, false);
	if (!page.done) {
		assert.deepEqual(
			page.value.map(({ sequenceNumber }) => sequenceNumber),
			[2, 3],
		);
	}
	assert.equal(
		transports.every((transport) => transport instanceof Transport),
		true,
	);
});
