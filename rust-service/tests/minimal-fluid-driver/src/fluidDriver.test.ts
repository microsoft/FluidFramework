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
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";

import { DirectDummyClient } from "./directDummy.js";
import { DirectSharedTreeClient } from "./directSharedTree.js";
import { field, frame, parseFrame, reference, u64 } from "./fsp4.js";
import type {
	ProjectedOperation,
	ProjectedOperationSubscription,
	SubmissionStream,
	WasmProtocolClient,
} from "./wasmClient.js";

/** UTF-8 encoder used for deterministic fixture identities and payloads. */
const encoder = new TextEncoder();

const directSchema = new SchemaFactory("fluid.experimental.direct-shared-tree-test");

class DirectTestState extends directSchema.object("DirectTestState", {
	value: directSchema.number,
}) {}

const directTreeConfiguration = new TreeViewConfiguration({ schema: DirectTestState });

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

/** Projects one captured direct submission as a service-sequenced operation. */
function projectedSubmission(request: Uint8Array, sequenceNumber: number): ProjectedOperation {
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
	const writer = readField();
	const session = readField();
	const submission = readField();
	const localSequence = new DataView(body.buffer, body.byteOffset + offset, 8).getBigUint64(0);
	offset += 8;
	const referencePresent = body[offset++] === 1;
	const referenceValue = referencePresent ? readField() : undefined;
	const payload = readField();
	return {
		position: encoder.encode(`direct-position-${sequenceNumber}`),
		sequenceNumber: BigInt(sequenceNumber),
		writer,
		session,
		submission,
		localSequenceNumber: localSequence,
		...(referenceValue === undefined ? {} : { reference: referenceValue }),
		payload,
	};
}

/** Returns submissions captured through either the persistent or unary path. */
function capturedSubmissions(client: TestClient): readonly Uint8Array[] {
	return client.streams[0]?.sent ?? client.unarySubmissions;
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
	/** Optional batch reader installed for batch-capable fixture clients. */
	public readonly nextBatch?: (
		maxOperations: number,
		maxBytes: number,
	) => Promise<readonly ProjectedOperation[]>;

	/** Creates a subscription beginning strictly after the supplied cursor. */
	public constructor(
		public readonly after: Uint8Array | undefined,
		batching: boolean,
	) {
		if (batching) {
			this.nextBatch = async (maxOperations, maxBytes) => {
				const first = await this.next();
				const operations = [first];
				let payloadBytes = first.payload.length;
				while (operations.length < maxOperations) {
					const operation = this.queued[0];
					if (operation === undefined || payloadBytes + operation.payload.length > maxBytes) {
						break;
					}
					operations.push(this.queued.shift() as ProjectedOperation);
					payloadBytes += operation.payload.length;
				}
				return operations;
			};
		}
	}

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
	/** Whether projected subscriptions expose bounded batch reads. */
	readonly batchSubscriptions?: boolean;
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
	/** Unary submissions captured for direct SharedTree projection tests. */
	public readonly unarySubmissions: Uint8Array[] = [];
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
			this.unarySubmissions.push(request);
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
		const subscription = new TestSubscription(after, this.options.batchSubscriptions ?? false);
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

test("batched subscriptions deliver ready operations in one ordered event", async () => {
	const client = new TestClient({ batchSubscriptions: true });
	const connection = await connect(client);
	const received: number[][] = [];
	connection.on("op", (_documentId, messages) => {
		received.push(messages.map(({ sequenceNumber }) => sequenceNumber));
	});

	client.subscriptions[0]?.push(operation(1));
	client.subscriptions[0]?.push(operation(2));
	await waitUntil(() => received.length === 1);
	assert.deepEqual(received, [[3, 4]]);
	assert.equal(connection.subscriptionBatchCount, 1);
	assert.equal(connection.peakSubscriptionBatchOperations, 2);
	assert.equal(connection.checkpointSequenceNumber, 4);
	connection.dispose();
});

test("direct SharedTree applies ready acknowledgements as one ordered batch", async () => {
	const client = new TestClient({ batchSubscriptions: true });
	const direct = await DirectSharedTreeClient.create(
		client,
		encoder.encode("direct-tree-document"),
		64,
		1024 * 1024,
		false,
	);
	const view = direct.tree.viewWith(directTreeConfiguration);
	view.initialize({ value: 0 });
	view.root.value = 1;
	await waitUntilStable(() => capturedSubmissions(client).length);
	const submissions = capturedSubmissions(client);
	assert(submissions.length > 1);
	assert.equal(client.streams.length, 1);

	for (const [index, request] of submissions.entries()) {
		client.subscriptions[0]?.push(projectedSubmission(request, index + 1));
	}
	await direct.waitForIdle();
	const initialSubmissionCount = submissions.length;

	assert.equal(direct.deliveredBatchCount, 1);
	assert.equal(direct.peakDeliveredBatchOperations, initialSubmissionCount);
	assert.equal(direct.lastAppliedSequenceNumber, initialSubmissionCount);
	assert.equal(view.root.value, 1);

	view.root.value = 2;
	view.root.value = 3;
	await waitUntilStable(() => capturedSubmissions(client).length);
	assert.equal(capturedSubmissions(client).length, initialSubmissionCount + 2);
	const priorPosition = encoder.encode(`direct-position-${initialSubmissionCount}`);
	for (
		let index = initialSubmissionCount;
		index < capturedSubmissions(client).length;
		index++
	) {
		const operation = projectedSubmission(
			capturedSubmissions(client)[index] as Uint8Array,
			index + 1,
		);
		assert.deepEqual(operation.reference, priorPosition);
		client.subscriptions[0]?.push({ ...operation, minimumReference: priorPosition });
	}
	await direct.waitForIdle();

	assert.equal(direct.deliveredBatchCount, 2);
	assert.equal(direct.lastAppliedSequenceNumber, initialSubmissionCount + 2);
	assert.equal(view.root.value, 3);
	view.dispose();
	await direct.dispose();
	assert.equal(client.subscriptions[0]?.cancelCount, 1);
});

test("direct SharedTree sessions converge independent writer batches", async () => {
	const firstClient = new TestClient({ batchSubscriptions: true });
	const secondClient = new TestClient({ batchSubscriptions: true });
	const document = encoder.encode("direct-multi-writer-document");
	const first = await DirectSharedTreeClient.create(
		firstClient,
		document,
		64,
		1024 * 1024,
		false,
	);
	const second = await DirectSharedTreeClient.create(
		secondClient,
		document,
		64,
		1024 * 1024,
		false,
	);
	const firstView = first.tree.viewWith(directTreeConfiguration);
	firstView.initialize({ value: 0 });
	firstView.root.value = 1;
	await waitUntilStable(() => capturedSubmissions(firstClient).length);
	const firstSubmissions = capturedSubmissions(firstClient);

	for (const [index, request] of firstSubmissions.entries()) {
		const operation = projectedSubmission(request, index + 1);
		firstClient.subscriptions[0]?.push(operation);
		secondClient.subscriptions[0]?.push(operation);
	}
	await first.waitForIdle();
	await waitUntil(() => second.lastAppliedSequenceNumber === firstSubmissions.length);
	const secondView = second.tree.viewWith(directTreeConfiguration);
	assert.equal(secondView.root.value, 1);

	secondView.root.value = 2;
	await waitUntilStable(() => capturedSubmissions(secondClient).length);
	assert.equal(capturedSubmissions(secondClient).length, 1);
	const nextSequenceNumber = firstSubmissions.length + 1;
	const operation = projectedSubmission(
		capturedSubmissions(secondClient)[0] as Uint8Array,
		nextSequenceNumber,
	);
	assert.deepEqual(
		operation.reference,
		encoder.encode(`direct-position-${nextSequenceNumber - 1}`),
	);
	firstClient.subscriptions[0]?.push(operation);
	secondClient.subscriptions[0]?.push(operation);
	await second.waitForIdle();
	await waitUntil(() => first.lastAppliedSequenceNumber === nextSequenceNumber);

	assert.equal(firstView.root.value, 2);
	assert.equal(secondView.root.value, 2);
	assert.equal(first.deliveredBatchCount, 2);
	assert.equal(second.deliveredBatchCount, 2);
	firstView.dispose();
	secondView.dispose();
	await Promise.all([first.dispose(), second.dispose()]);
});

test("direct dummy sessions converge independent writer batches", async () => {
	const firstClient = new TestClient({ batchSubscriptions: true });
	const secondClient = new TestClient({ batchSubscriptions: true });
	const document = encoder.encode("direct-dummy-document");
	const first = await DirectDummyClient.create(firstClient, document, 64, 1024 * 1024, false);
	const second = await DirectDummyClient.create(
		secondClient,
		document,
		64,
		1024 * 1024,
		false,
	);
	first.set(1);
	first.set(2);
	await waitUntilStable(() => capturedSubmissions(firstClient).length);
	const firstSubmissions = capturedSubmissions(firstClient);
	assert.equal(firstClient.streams.length, 1);

	for (const [index, request] of firstSubmissions.entries()) {
		const operation = projectedSubmission(request, index + 1);
		firstClient.subscriptions[0]?.push(operation);
		secondClient.subscriptions[0]?.push(operation);
	}
	await first.waitForIdle();
	await waitUntil(() => second.lastAppliedSequenceNumber === 2);

	assert.equal(first.value, 2);
	assert.equal(second.value, 2);
	assert.equal(first.appliedOpCount, 2);
	assert.equal(second.appliedOpCount, 2);
	assert.equal(first.deliveredBatchCount, 1);
	assert.equal(second.deliveredBatchCount, 1);
	assert.equal(first.peakDeliveredBatchOperations, 2);
	assert.equal(second.peakDeliveredBatchOperations, 2);
	await Promise.all([first.dispose(), second.dispose()]);
});

test("direct dummy retains unary submission fallback", async () => {
	const backingClient = new TestClient({ batchSubscriptions: true });
	const client = new Proxy(backingClient, {
		get(target, property, receiver) {
			return property === "openSubmissionStream"
				? undefined
				: Reflect.get(target, property, receiver);
		},
	}) as WasmProtocolClient;
	const direct = await DirectDummyClient.create(
		client,
		encoder.encode("direct-dummy-unary-document"),
		64,
		1024 * 1024,
		false,
	);
	direct.set(1);
	await waitUntilStable(() => backingClient.unarySubmissions.length);
	assert.equal(backingClient.streams.length, 0);
	assert.equal(backingClient.unarySubmissions.length, 1);
	backingClient.subscriptions[0]?.push(
		projectedSubmission(backingClient.unarySubmissions[0] as Uint8Array, 1),
	);
	await direct.waitForIdle();
	assert.equal(direct.value, 1);
	await direct.dispose();
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

/** Waits until a synchronously produced count remains unchanged across one event-loop turn. */
async function waitUntilStable(readCount: () => number): Promise<void> {
	let previous = -1;
	await waitUntil(() => {
		const current = readCount();
		const stable = current > 0 && current === previous;
		previous = current;
		return stable;
	});
}
