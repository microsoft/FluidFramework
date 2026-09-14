import assert from "node:assert/strict";
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
import { field, frame, parseFrame, reference, u64 } from "./fsp4.js";
import type {
	ProjectedOperation,
	ProjectedOperationSubscription,
	SubmissionStream,
	WasmProtocolClient,
} from "./wasmClient.js";

/** UTF-8 encoder used for deterministic fixture identities and payloads. */
const encoder = new TextEncoder();

/** Reads the request identity from an encoded FSP4 frame header. */
function requestId(request: Uint8Array): bigint {
	return new DataView(request.buffer, request.byteOffset + 8, 8).getBigUint64(0);
}

/** Extracts the submission identity and local sequence number from an FSP4 request. */
function submissionMetadata(request: Uint8Array): {
	identity: Uint8Array;
	sequenceNumber: number;
} {
	const body = parseFrame(request).body;
	let offset = 0;
	const readField = (): Uint8Array => {
		const length = new DataView(body.buffer, body.byteOffset + offset, 4).getUint32(0);
		offset += 4;
		const value = body.slice(offset, offset + length);
		offset += length;
		return value;
	};
	readField();
	readField();
	readField();
	const identity = readField();
	const sequenceNumber = Number(
		new DataView(body.buffer, body.byteOffset + offset, 8).getBigUint64(0),
	);
	return { identity, sequenceNumber };
}

/** Converts opaque submission identity bytes to a stable set key. */
function byteKey(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("hex");
}

/** Encodes an accepted-submission response for the supplied request. */
function submissionResponse(request: Uint8Array, sequenceNumber: number): Uint8Array {
	return frame(
		requestId(request),
		65,
		new Uint8Array([1]),
		field(encoder.encode(`position-${sequenceNumber}`)),
		u64(sequenceNumber),
		reference(),
	);
}

/** Controllable projected-operation subscription used to verify cursor and disposal behavior. */
class TestSubscription implements ProjectedOperationSubscription {
	/** Number of times the driver cancelled this subscription. */
	public cancelCount = 0;
	/** Operations waiting for the driver to consume them. */
	private readonly queued: ProjectedOperation[] = [];
	/** Pending consumer completed by a pushed operation or cancellation. */
	private pending:
		| {
				resolve: (operation: ProjectedOperation) => void;
				reject: (error: Error) => void;
		  }
		| undefined;

	/** Creates a subscription beginning strictly after the supplied cursor. */
	public constructor(public readonly after: Uint8Array | undefined) {}

	/** Returns a queued operation or waits for the fixture to push one. */
	public next(): Promise<ProjectedOperation> {
		const operation = this.queued.shift();
		if (operation !== undefined) {
			return Promise.resolve(operation);
		}
		return new Promise<ProjectedOperation>((resolve, reject) => {
			this.pending = { resolve, reject };
		});
	}

	/** Delivers an operation immediately or queues it for the next read. */
	public push(operation: ProjectedOperation): void {
		if (this.pending === undefined) {
			this.queued.push(operation);
		} else {
			const { resolve } = this.pending;
			this.pending = undefined;
			resolve(operation);
		}
	}

	/** Rejects any pending read and records resource disposal. */
	public cancel(): void {
		this.cancelCount++;
		this.pending?.reject(new Error("subscription cancelled"));
		this.pending = undefined;
	}
}

/** Controllable ordered submission stream with write and response failure injection. */
class TestSubmissionStream implements SubmissionStream {
	/** Encoded submission requests written by the driver in stream order. */
	public readonly sent: Uint8Array[] = [];
	/** Number of times the driver closed this stream. */
	public closeCount = 0;
	/** Acknowledgements queued before the driver requests them. */
	private readonly responses: Uint8Array[] = [];
	/** Pending acknowledgement consumer, when one exists. */
	private pendingNext: ((response: Uint8Array) => void) | undefined;
	/** Index of the next sent request to acknowledge. */
	private acknowledged = 0;

	/** Configures automatic responses and deterministic write or response failure. */
	public constructor(
		private readonly client: TestClient,
		private readonly autoRespond: boolean,
		private readonly failWriteSequence?: number,
		private failNext = false,
	) {}

	/** Records and commits a write unless its sequence number is selected to fail. */
	public async send(request: Uint8Array): Promise<void> {
		this.sent.push(request);
		const { sequenceNumber } = submissionMetadata(request);
		if (sequenceNumber === this.failWriteSequence) {
			throw new Error(`stream write failed for ${sequenceNumber}`);
		}
		this.client.commit(request);
		if (this.autoRespond) {
			this.respondNext();
		}
	}

	/** Returns the next acknowledgement or injects one post-commit response loss. */
	public async next(): Promise<Uint8Array> {
		if (this.failNext) {
			this.failNext = false;
			throw new Error("stream response lost after commit");
		}
		const response = this.responses.shift();
		return response ?? new Promise((resolve) => (this.pendingNext = resolve));
	}

	/** Acknowledges the next unacknowledged request in submission order. */
	public respondNext(): void {
		const request = this.sent[this.acknowledged++];
		assert(request !== undefined);
		const { sequenceNumber } = submissionMetadata(request);
		const response = submissionResponse(request, sequenceNumber);
		if (this.pendingNext === undefined) {
			this.responses.push(response);
		} else {
			const resolve = this.pendingNext;
			this.pendingNext = undefined;
			resolve(response);
		}
	}

	/** Records that the driver released this submission stream. */
	public close(): void {
		this.closeCount++;
	}
}

/** Failure and response policy for a lifecycle test client. */
interface TestClientOptions {
	/** Whether stream writes immediately make acknowledgements available. */
	readonly autoRespond?: boolean;
	/** Local sequence number whose stream write should fail before commit. */
	readonly failWriteSequence?: number;
	/** Whether the first stream response should fail after commit. */
	readonly failNext?: boolean;
}

/** In-memory generated-client double that records driver lifecycle interactions. */
class TestClient implements WasmProtocolClient {
	/** Unary FSP4 request kinds observed by the fixture. */
	public readonly requestKinds: number[] = [];
	/** Submission streams opened across initial connection and reconnects. */
	public readonly streams: TestSubmissionStream[] = [];
	/** Projected subscriptions opened across initial connection and restarts. */
	public readonly subscriptions: TestSubscription[] = [];
	/** Cursors supplied to explicit projected reads. */
	public readonly projectedReadAfters: (Uint8Array | undefined)[] = [];
	/** Operations returned by explicit projected reads. */
	public projectedReadOperations: readonly ProjectedOperation[] = [];
	/** Submission identities committed by stream or unary requests. */
	private readonly committed = new Set<string>();

	/** Creates a client with deterministic stream behavior. */
	public constructor(private readonly options: TestClientOptions = {}) {}

	/** Handles open-session and unary-submit requests used by the driver. */
	public async request(request: Uint8Array): Promise<Uint8Array> {
		const kind = parseFrame(request).kind;
		this.requestKinds.push(kind);
		if (kind === 2) {
			return frame(requestId(request), 64, new Uint8Array([2]));
		}
		if (kind === 3) {
			this.commit(request);
			return submissionResponse(request, submissionMetadata(request).sequenceNumber);
		}
		throw new Error(`unexpected request kind ${kind}`);
	}

	/** Opens and records a submission stream configured from the client options. */
	public async openSubmissionStream(): Promise<TestSubmissionStream> {
		const stream = new TestSubmissionStream(
			this,
			this.options.autoRespond ?? true,
			this.options.failWriteSequence,
			this.options.failNext ?? false,
		);
		this.streams.push(stream);
		return stream;
	}

	/** Records the cursor and returns the configured projected page. */
	public async readProjected(_document: Uint8Array, after?: Uint8Array) {
		this.projectedReadAfters.push(after);
		const cursor = this.projectedReadOperations.at(-1)?.position ?? after;
		return {
			operations: this.projectedReadOperations,
			...(cursor === undefined ? {} : { cursor }),
			hasMore: false,
		};
	}

	/** Opens and records a projected-operation subscription. */
	public subscribeProjected(
		_document: Uint8Array,
		after?: Uint8Array,
	): ProjectedOperationSubscription {
		const subscription = new TestSubscription(after);
		this.subscriptions.push(subscription);
		return subscription;
	}

	/** Resolves identities previously committed by this fixture. */
	public async resolveSubmission(
		_document: Uint8Array,
		_writer: Uint8Array,
		_session: Uint8Array,
		submission: Uint8Array,
	) {
		return this.committed.has(byteKey(submission))
			? ({
					kind: "committed",
					position: encoder.encode("recovered-position"),
					sequenceNumber: 1n,
				} as const)
			: ({ kind: "notCommitted" } as const);
	}

	/** Marks the submission identity in an encoded request as committed. */
	public commit(request: Uint8Array): void {
		this.committed.add(byteKey(submissionMetadata(request).identity));
	}

	/** Echoes blob bytes as their fixture digest and records no persistence overhead. */
	public async uploadBlob(payload: Uint8Array) {
		return { digest: payload, sizeBytes: BigInt(payload.length), deduplicated: false };
	}

	/** Echoes the fixture digest as blob contents. */
	public async fetchBlob(digest: Uint8Array) {
		return digest;
	}

	/** Returns a stable empty-summary publication receipt. */
	public async publishSummary() {
		return {
			digest: new Uint8Array(32),
			entryCount: 0,
			persistedBytes: 0n,
			deduplicated: false,
		};
	}

	/** Returns the empty summary represented by the fixture receipt. */
	public async fetchSummary() {
		return [];
	}

	/** Performs no transport work in the in-memory fixture. */
	public disconnect(): void {}
	/** Performs no transport work in the in-memory fixture. */
	public reconnect(): void {}
	/** Fixture clients do not record encoded traffic volume. */
	public readonly wireBytes = 0n;
	/** Fixture clients do not record unary response sizes. */
	public readonly peakResponseBytes = 0;
	/** Fixture clients do not record subscription frame sizes. */
	public readonly peakSubscriptionFrameBytes = 0;
	/** Fixture clients do not queue generated subscription frames. */
	public readonly peakSubscriptionQueueDepth = 0;
}

/** Stable resolved URL shared by lifecycle test connections. */
const resolvedUrl: IResolvedUrl = {
	type: "fluid",
	id: "stream-test-document",
	url: "fluid://minimal/stream-test-document",
	tokens: {},
	endpoints: {},
};

/** Creates one Fluid operation with the requested local sequence number. */
function message(clientSequenceNumber: number): IDocumentMessage {
	return {
		clientSequenceNumber,
		referenceSequenceNumber: 0,
		type: "op",
		contents: { clientSequenceNumber },
	};
}

test("document service preserves injected submission streaming", async () => {
	const client = new TestClient();
	const factory = new MinimalWasmDocumentServiceFactory(async () => client);
	const service = (await factory.createDocumentService(
		resolvedUrl,
	)) as MinimalWasmDocumentService;
	const connection = (await service.connectToDeltaStream({
		mode: "write",
	} as IClient)) as MinimalWasmDeltaConnection;

	connection.submit([message(1)]);
	await connection.waitForIdle();

	assert.equal(client.streams.length, 1);
	assert.equal(client.streams[0]?.sent.length, 1);
	assert.deepEqual(client.requestKinds, [2]);
	connection.dispose();
});

test("streamed writes and acknowledgements preserve order and pending state", async () => {
	const client = new TestClient({ autoRespond: false });
	const connection = await connect(client);
	connection.submit([message(1), message(2)]);
	const stream = client.streams[0];
	assert(stream !== undefined);
	await waitUntil(() => stream.sent.length === 2);

	assert.deepEqual(
		stream.sent.map((request) => submissionMetadata(request).sequenceNumber),
		[1, 2],
	);
	assert.deepEqual([...connection.pending.keys()], [1, 2]);
	stream.respondNext();
	await waitUntil(() => !connection.pending.has(1));
	assert.deepEqual([...connection.pending.keys()], [2]);
	stream.respondNext();
	await connection.waitForIdle();
	assert.equal(connection.pending.size, 0);
	connection.dispose();
});

test("stream failures remain recoverable through committed resolution and unary resubmit", async (t) => {
	await t.test(
		"write failure resubmits a not-committed operation through unary fallback",
		async () => {
			const client = new TestClient({ failWriteSequence: 1 });
			const connection = await connect(client);
			connection.submit([message(1)]);
			await assert.rejects(connection.waitForIdle(), /stream write failed/);
			await connection.reconnect();
			assert.equal(client.streams.length, 2);
			assert.equal((await connection.recoverPending()).get(1)?.kind, "notCommitted");
			await connection.resubmitPending(1);
			assert.equal(connection.pending.size, 0);
			assert.deepEqual(client.requestKinds, [2, 2, 3]);
			connection.dispose();
		},
	);

	await t.test("response failure resolves an already committed operation", async () => {
		const client = new TestClient({ failNext: true });
		const connection = await connect(client);
		connection.submit([message(1)]);
		await assert.rejects(connection.waitForIdle(), /response lost after commit/);
		await connection.reconnect();
		assert.equal(client.streams.length, 2);
		assert.equal((await connection.recoverPending()).get(1)?.kind, "committed");
		assert.equal(connection.pending.size, 0);
		assert.deepEqual(client.requestKinds, [2, 2]);
		connection.dispose();
	});
});

test("reconnect and disposal close submission streams and cancel subscriptions", async () => {
	const client = new TestClient();
	const connection = await connect(client);
	const firstStream = client.streams[0];
	const firstSubscription = client.subscriptions[0];
	assert(firstStream !== undefined);
	assert(firstSubscription !== undefined);

	await connection.reconnect();
	assert.equal(firstStream.closeCount, 1);
	assert.equal(firstSubscription.cancelCount, 1);
	assert.equal(client.streams.length, 2);
	assert.equal(client.subscriptions.length, 2);

	connection.dispose();
	await waitUntil(
		() => client.streams[1]?.closeCount === 1 && client.subscriptions[1]?.cancelCount === 1,
	);
});

test("disconnect closes the submission stream and cancels the subscription", async () => {
	const client = new TestClient();
	const connection = await connect(client);
	connection.disconnect();
	await waitUntil(
		() => client.streams[0]?.closeCount === 1 && client.subscriptions[0]?.cancelCount === 1,
	);
});

test("synchronization advances the cursor used to restart a subscription", async () => {
	const client = new TestClient();
	client.projectedReadOperations = [operation(1)];
	const connection = await connect(client);
	const received: number[] = [];
	connection.on("op", (_documentId, messages) => {
		received.push(...messages.map(({ sequenceNumber }) => sequenceNumber));
	});

	assert.deepEqual(
		(await connection.synchronize()).map(({ sequenceNumber }) => sequenceNumber),
		[3],
	);
	assert.equal(await connection.restartSubscription(), true);
	assert.equal(client.subscriptions[0]?.cancelCount, 1);
	assert.deepEqual(client.subscriptions[1]?.after, encoder.encode("cursor-1"));

	client.subscriptions[1]?.push(operation(2));
	await waitUntil(() => received.length === 2);
	assert.deepEqual(received, [3, 4]);
	connection.dispose();
});

test("clients without submission streaming retain unary fallback", async () => {
	const backingClient = new TestClient();
	const client = new Proxy(backingClient, {
		get(target, property, receiver) {
			return property === "openSubmissionStream"
				? undefined
				: Reflect.get(target, property, receiver);
		},
	}) as WasmProtocolClient;
	const connection = await connect(client);
	connection.submit([message(1)]);
	await connection.waitForIdle();
	assert.deepEqual(backingClient.requestKinds, [2, 3]);
	assert.equal(backingClient.streams.length, 0);
	connection.dispose();
});

/** Connects a write-mode delta connection over the supplied generated-client fixture. */
async function connect(client: WasmProtocolClient): Promise<MinimalWasmDeltaConnection> {
	const factory = new MinimalWasmDocumentServiceFactory(async () => client);
	const service = (await factory.createDocumentService(
		resolvedUrl,
	)) as MinimalWasmDocumentService;
	return (await service.connectToDeltaStream({
		mode: "write",
	} as IClient)) as MinimalWasmDeltaConnection;
}

/** Creates one projected remote operation at a deterministic cursor and sequence. */
function operation(sequenceNumber: number): ProjectedOperation {
	return {
		position: encoder.encode(`cursor-${sequenceNumber}`),
		sequenceNumber: BigInt(sequenceNumber),
		writer: encoder.encode("remote-writer"),
		session: encoder.encode("remote-session"),
		submission: encoder.encode(`remote-submission-${sequenceNumber}`),
		localSequenceNumber: BigInt(sequenceNumber),
		payload: encoder.encode(JSON.stringify(message(sequenceNumber))),
	};
}

/** Polls until asynchronous lifecycle work reaches the asserted fixture state. */
async function waitUntil(check: () => boolean): Promise<void> {
	const deadline = Date.now() + 2_000;
	while (!check()) {
		if (Date.now() >= deadline) {
			throw new Error("timed out waiting for fixture state");
		}
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}
