/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { InjectedClient, SummaryEntry } = require("./pkg/fluid_webtransport_browser.js");
const encoder = new TextEncoder();

function concat(...parts) {
	const length = parts.reduce((sum, part) => sum + part.length, 0);
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const part of parts) {
		bytes.set(part, offset);
		offset += part.length;
	}
	return bytes;
}

function u32(value) {
	const bytes = new Uint8Array(4);
	new DataView(bytes.buffer).setUint32(0, value);
	return bytes;
}

function u64(value) {
	const bytes = new Uint8Array(8);
	new DataView(bytes.buffer).setBigUint64(0, BigInt(value));
	return bytes;
}

function field(value) {
	const bytes = typeof value === "string" ? encoder.encode(value) : value;
	return concat(u32(bytes.length), bytes);
}

function optionalField(value) {
	return value === undefined ? new Uint8Array([0]) : concat(new Uint8Array([1]), field(value));
}

function reference(value) {
	return optionalField(value);
}

function frame(requestId, kind, ...body) {
	const payload = concat(...body);
	return concat(
		encoder.encode("FSP4"),
		new Uint8Array([0, 2, kind, 0]),
		u64(requestId),
		u32(payload.length),
		payload,
	);
}

function createRequest(requestId = 1) {
	return frame(requestId, 1, field("node-document"));
}

function acknowledged(requestId = 1) {
	return frame(requestId, 64, new Uint8Array([1]));
}

function requestId(request) {
	return new DataView(request.buffer, request.byteOffset, request.byteLength).getBigUint64(8);
}

function projectedReadResult(requestIdValue, operations, cursor, hasMore) {
	const encodedOperations = operations.map((operation) =>
		concat(
			field(operation.position),
			u64(operation.sequenceNumber),
			reference(operation.minimumReference),
			field(operation.writer),
			field(operation.session),
			field(operation.submission),
			u64(operation.localSequenceNumber),
			reference(operation.reference),
			field(operation.payload),
		),
	);
	return frame(
		requestIdValue,
		68,
		u32(operations.length),
		...encodedOperations,
		optionalField(cursor),
		new Uint8Array([Number(hasMore)]),
	);
}

function resolutionResult(requestIdValue, kind, committed) {
	if (kind === "committed") {
		return frame(
			requestIdValue,
			69,
			new Uint8Array([1]),
			field(committed.position),
			u64(committed.sequenceNumber),
			reference(committed.minimumReference),
		);
	}
	return frame(requestIdValue, 69, new Uint8Array([kind === "notCommitted" ? 2 : 3]));
}

function blobUploadResult(requestIdValue, digest, sizeBytes, deduplicated) {
	return frame(
		requestIdValue,
		70,
		digest,
		u64(sizeBytes),
		new Uint8Array([Number(deduplicated)]),
	);
}

function blobResult(requestIdValue, digest, payload) {
	return frame(requestIdValue, 71, digest, u32(payload.length), payload);
}

function summaryPublicationResult(
	requestIdValue,
	digest,
	entryCount,
	persistedBytes,
	deduplicated,
) {
	return frame(
		requestIdValue,
		72,
		digest,
		u32(entryCount),
		u64(persistedBytes),
		new Uint8Array([Number(deduplicated)]),
	);
}

function summaryResult(requestIdValue, digest, entries) {
	return frame(
		requestIdValue,
		73,
		digest,
		u32(entries.length),
		...entries.flatMap((entry) => [field(entry.path), entry.blob]),
	);
}

test("actual WASM validates requests and responses around the injected transport", async () => {
	const observed = [];
	const client = new InjectedClient(
		{
			async request(request) {
				observed.push(request.slice());
				return acknowledged(7);
			},
		},
		1024,
	);

	const request = createRequest(7);
	const response = await client.request(request);
	assert.deepEqual(observed, [request]);
	assert.deepEqual(response, acknowledged(7));
	assert.equal(client.state, "connected");
	assert.equal(client.wireBytes, BigInt(request.length + response.length));
	assert.equal(client.peakResponseBytes, response.length);
});

test("WASM rejects malformed and oversized frames before or after transport", async () => {
	let calls = 0;
	const malformedClient = new InjectedClient(
		{
			async request() {
				calls++;
				return new Uint8Array();
			},
		},
		64,
	);
	await assert.rejects(
		malformedClient.request(new Uint8Array([1, 2, 3])),
		/frame is truncated/,
	);
	assert.equal(calls, 0);

	const malformedResponse = new InjectedClient(
		{
			async request() {
				return new Uint8Array([1, 2, 3]);
			},
		},
		64,
	);
	await assert.rejects(malformedResponse.request(createRequest()), /frame is truncated/);

	const oversizedResponse = new InjectedClient(
		{
			async request() {
				return new Uint8Array(65);
			},
		},
		64,
	);
	await assert.rejects(
		oversizedResponse.request(createRequest()),
		/frame exceeds the configured limit/,
	);
});

test("WASM rejects mismatched request IDs", async () => {
	const client = new InjectedClient(
		{
			async request() {
				return acknowledged(2);
			},
		},
		1024,
	);
	await assert.rejects(client.request(createRequest(1)), /response request id did not match/);
});

test("the request queue is bounded and cancellation reaches the transport", async () => {
	let resolveRequest;
	let cancellations = 0;
	const client = new InjectedClient(
		{
			request() {
				return new Promise((resolve) => {
					resolveRequest = resolve;
				});
			},
			cancel() {
				cancellations++;
			},
		},
		1024,
	);

	const pending = client.request(createRequest());
	await assert.rejects(client.request(createRequest(2)), /request queue is full/);
	client.cancel();
	assert.equal(cancellations, 1);
	resolveRequest(acknowledged());
	await assert.rejects(pending, /request was cancelled/);
});

test("disconnect and explicit reconnect replace the transport without retry", async () => {
	let disconnects = 0;
	let firstCalls = 0;
	const client = new InjectedClient(
		{
			async request() {
				firstCalls++;
				return acknowledged();
			},
			disconnect() {
				disconnects++;
			},
		},
		1024,
	);

	assert.throws(
		() => client.reconnect({ request: async () => acknowledged() }),
		/connected client cannot reconnect/,
	);

	client.disconnect();
	assert.equal(client.state, "disconnected");
	await assert.rejects(client.request(createRequest()), /client is disconnected/);
	assert.equal(firstCalls, 0);
	assert.equal(disconnects, 1);

	let replacementCalls = 0;
	client.reconnect({
		async request() {
			replacementCalls++;
			return acknowledged();
		},
	});
	await client.request(createRequest());
	assert.equal(replacementCalls, 1);
});

test("transport rejection disconnects and shutdown is terminal", async () => {
	let shutdowns = 0;
	const client = new InjectedClient(
		{
			async request() {
				throw new Error("transport unavailable");
			},
			shutdown() {
				shutdowns++;
			},
		},
		1024,
	);

	await assert.rejects(client.request(createRequest()), /transport unavailable/);
	assert.equal(client.state, "disconnected");
	client.reconnect({
		async request() {
			return acknowledged();
		},
		shutdown() {
			shutdowns++;
		},
	});
	client.shutdown();
	assert.equal(shutdowns, 1);
	assert.equal(client.state, "closed");
	assert.throws(
		() => client.reconnect({ request: async () => acknowledged() }),
		/cannot reconnect/,
	);
	await assert.rejects(client.request(createRequest()), /client is closed/);
});

test("projected reads use the accepted request and preserve opaque page metadata", async () => {
	const document = encoder.encode("node-document");
	const after = encoder.encode("opaque-after");
	const operation = {
		position: encoder.encode("opaque-position"),
		sequenceNumber: 9,
		minimumReference: undefined,
		writer: encoder.encode("writer"),
		session: encoder.encode("session"),
		submission: encoder.encode("submission"),
		localSequenceNumber: 4,
		reference: encoder.encode("opaque-reference"),
		payload: encoder.encode("projected-payload"),
	};
	const cursor = encoder.encode("administrative-cursor");
	let observedRequest;
	const client = new InjectedClient(
		{
			async request(request) {
				observedRequest = request.slice();
				return projectedReadResult(requestId(request), [operation], cursor, true);
			},
		},
		4096,
	);

	const page = await client.readProjected(document, after);
	assert.deepEqual(observedRequest, frame(1, 8, field(document), optionalField(after)));
	assert.equal(page.hasMore, true);
	assert.deepEqual(page.cursor, cursor);
	assert.equal(page.operations.length, 1);
	const [actual] = page.operations;
	assert.deepEqual(actual.position, operation.position);
	assert.equal(actual.sequenceNumber, 9n);
	assert.equal(actual.minimumReference, undefined);
	assert.deepEqual(actual.writer, operation.writer);
	assert.deepEqual(actual.session, operation.session);
	assert.deepEqual(actual.submission, operation.submission);
	assert.equal(actual.localSequenceNumber, 4n);
	assert.deepEqual(actual.reference, operation.reference);
	assert.deepEqual(actual.payload, operation.payload);
});

test("submission resolution exposes every accepted outcome without submitting", async () => {
	const document = encoder.encode("node-document");
	const writer = encoder.encode("writer");
	const session = encoder.encode("session");
	const submission = encoder.encode("submission");
	const expectedRequest = frame(
		1,
		9,
		field(document),
		field(writer),
		field(session),
		field(submission),
	);
	const committed = {
		position: encoder.encode("committed-position"),
		sequenceNumber: 12,
		minimumReference: encoder.encode("minimum-reference"),
	};

	for (const kind of ["committed", "notCommitted", "stillUncertain"]) {
		let observedRequest;
		const client = new InjectedClient(
			{
				async request(request) {
					observedRequest = request.slice();
					return resolutionResult(requestId(request), kind, committed);
				},
			},
			4096,
		);
		const resolution = await client.resolveSubmission(document, writer, session, submission);
		assert.deepEqual(observedRequest, expectedRequest);
		assert.equal(observedRequest[6], 9);
		assert.equal(resolution.kind, kind);
		if (kind === "committed") {
			assert.deepEqual(resolution.position, committed.position);
			assert.equal(resolution.sequenceNumber, 12n);
			assert.deepEqual(resolution.minimumReference, committed.minimumReference);
		} else {
			assert.equal(resolution.position, undefined);
			assert.equal(resolution.sequenceNumber, undefined);
			assert.equal(resolution.minimumReference, undefined);
		}
	}
});

test("failed ambiguity resolution disconnects after one attempt with no hidden retry", async () => {
	let calls = 0;
	const client = new InjectedClient(
		{
			async request(request) {
				calls++;
				assert.equal(request[6], 9);
				throw new Error("response lost after commit");
			},
		},
		4096,
	);

	await assert.rejects(
		client.resolveSubmission(
			encoder.encode("node-document"),
			encoder.encode("writer"),
			encoder.encode("session"),
			encoder.encode("submission"),
		),
		/response lost after commit/,
	);
	assert.equal(calls, 1);
	assert.equal(client.state, "disconnected");
});

test("blob operations use accepted kinds and expose typed upload metadata", async () => {
	const payload = encoder.encode("content-addressed payload");
	const digest = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
	const observed = [];
	const client = new InjectedClient(
		{
			async request(request) {
				observed.push(request.slice());
				return request[6] === 10
					? blobUploadResult(requestId(request), digest, payload.length, false)
					: blobResult(requestId(request), digest, payload);
			},
		},
		4096,
	);

	const upload = await client.uploadBlob(payload);
	assert.deepEqual(observed[0], frame(1, 10, u32(payload.length), payload));
	assert.deepEqual(upload.digest, digest);
	assert.equal(upload.sizeBytes, BigInt(payload.length));
	assert.equal(upload.deduplicated, false);

	assert.deepEqual(await client.fetchBlob(digest), payload);
	assert.deepEqual(observed[1], frame(2, 11, digest));
});

test("blob fetch validates echoed digests and bounded empty payloads", async () => {
	const digest = new Uint8Array(32).fill(1);
	const mismatched = new Uint8Array(32).fill(2);
	const mismatchClient = new InjectedClient(
		{
			async request(request) {
				return blobResult(requestId(request), mismatched, new Uint8Array());
			},
		},
		1024,
	);
	await assert.rejects(
		mismatchClient.fetchBlob(digest),
		/digest does not match the requested blob/,
	);

	const emptyClient = new InjectedClient(
		{
			async request(request) {
				return blobResult(requestId(request), digest, new Uint8Array());
			},
		},
		1024,
	);
	assert.deepEqual(await emptyClient.fetchBlob(digest), new Uint8Array());
	await assert.rejects(
		emptyClient.uploadBlob(new Uint8Array(1025)),
		/frame exceeds the configured limit/,
	);
});

test("summary operations preserve typed entries and validate echoed digests", async () => {
	const digest = new Uint8Array(32).fill(3);
	const blobA = new Uint8Array(32).fill(4);
	const blobB = new Uint8Array(32).fill(5);
	const entries = [
		new SummaryEntry(encoder.encode("a/path"), blobA),
		new SummaryEntry(encoder.encode("b/path"), blobB),
	];
	const expectedEntries = entries.map((entry) => ({ path: entry.path, blob: entry.blob }));
	const observed = [];
	const client = new InjectedClient(
		{
			async request(request) {
				observed.push(request.slice());
				return request[6] === 12
					? summaryPublicationResult(requestId(request), digest, entries.length, 94, true)
					: summaryResult(requestId(request), digest, expectedEntries);
			},
		},
		4096,
	);

	const publication = await client.publishSummary(entries);
	assert.deepEqual(
		observed[0],
		frame(1, 12, u32(entries.length), field("a/path"), blobA, field("b/path"), blobB),
	);
	assert.deepEqual(publication.digest, digest);
	assert.equal(publication.entryCount, 2);
	assert.equal(publication.persistedBytes, 94n);
	assert.equal(publication.deduplicated, true);

	const fetched = await client.fetchSummary(digest);
	assert.deepEqual(observed[1], frame(2, 13, digest));
	assert.equal(fetched.length, 2);
	assert.deepEqual(fetched[0].path, expectedEntries[0].path);
	assert.deepEqual(fetched[0].blob, expectedEntries[0].blob);
	assert.deepEqual(fetched[1].path, expectedEntries[1].path);
	assert.deepEqual(fetched[1].blob, expectedEntries[1].blob);

	const mismatchClient = new InjectedClient(
		{
			async request(request) {
				return summaryResult(requestId(request), new Uint8Array(32).fill(9), []);
			},
		},
		4096,
	);
	await assert.rejects(
		mismatchClient.fetchSummary(digest),
		/digest does not match the requested summary/,
	);
});
