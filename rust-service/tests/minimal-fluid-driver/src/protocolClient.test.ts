import assert from "node:assert/strict";
import test from "node:test";

import { FieldReader, field, frame, parseFrame, reference, u64 } from "./fsp4.js";
import { ProtocolClient } from "./protocolClient.js";
import type { WasmProtocolClient } from "./wasmClient.js";

/** UTF-8 encoder for deterministic protocol fixture values. */
const encoder = new TextEncoder();

/** Creates a generated-client double that returns unary responses in order. */
function fakeWasm(responses: Uint8Array[]): WasmProtocolClient {
	return {
		/** Returns the next prepared unary FSP4 response. */
		async request(): Promise<Uint8Array> {
			const response = responses.shift();
			assert(response !== undefined);
			return response;
		},
		/** Returns an empty projected page for unused fixture reads. */
		async readProjected() {
			return { operations: [], hasMore: false };
		},
		/** Returns a subscription that rejects any unexpected operation read. */
		subscribeProjected() {
			return {
				/** Rejects because this protocol test never supplies projected operations. */
				async next() {
					throw new Error("fixture subscription has no operations");
				},
				/** Requires no disposal work for the stateless fixture. */
				cancel() {},
			};
		},
		/** Resolves every unused fixture submission as not committed. */
		async resolveSubmission() {
			return { kind: "notCommitted" };
		},
		/** Echoes uploaded bytes as the fixture blob digest. */
		async uploadBlob(payload) {
			return { digest: payload, sizeBytes: BigInt(payload.length), deduplicated: false };
		},
		/** Echoes a fixture digest as blob contents. */
		async fetchBlob(digest) {
			return digest;
		},
		/** Returns a deterministic summary receipt from the first entry. */
		async publishSummary(entries) {
			return {
				digest: entries[0]?.blob ?? new Uint8Array(),
				entryCount: entries.length,
				persistedBytes: 0n,
				deduplicated: false,
			};
		},
		/** Returns the empty summary represented by the fixture receipt. */
		async fetchSummary() {
			return [];
		},
		/** Requires no transport work for the stateless fixture. */
		disconnect() {},
		/** Requires no transport work for the stateless fixture. */
		reconnect() {},
		wireBytes: 0n,
		peakResponseBytes: 0,
		peakSubscriptionFrameBytes: 0,
		peakSubscriptionQueueDepth: 0,
	};
}

test("create, open, submit, and latest snapshot use documented FSP4 envelopes", async () => {
	const position = encoder.encode("opaque-position");
	const digest = new Uint8Array(32).fill(7);
	const client = new ProtocolClient(
		fakeWasm([
			frame(1n, 64, new Uint8Array([1])),
			frame(2n, 64, new Uint8Array([2])),
			frame(3n, 65, new Uint8Array([1]), field(position), u64(1), reference()),
			frame(4n, 67, new Uint8Array([1]), field(position), reference(position), field(digest)),
		]),
	);
	const document = encoder.encode("document");
	await client.create(document);
	await client.openSession(document, encoder.encode("writer"), encoder.encode("session"));
	assert.deepEqual(
		await client.submit(
			document,
			encoder.encode("writer"),
			encoder.encode("session"),
			encoder.encode("submission"),
			1,
			encoder.encode("payload"),
		),
		position,
	);
	assert.deepEqual(await client.latestSummaryDigest(document), digest);
});

test("frame parser rejects non-FSP4 data without interpreting canonical storage", () => {
	assert.throws(() => parseFrame(encoder.encode("FSQ2")), /invalid FSP4 response header/);
	const reader = new FieldReader(new Uint8Array([0, 0, 0, 2, 1]));
	assert.throws(() => reader.field(), /truncated FSP4 field payload/);
});
