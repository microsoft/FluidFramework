import assert from "node:assert/strict";
import test from "node:test";

import { FieldReader, field, frame, parseFrame, reference, u64 } from "./fsp4.js";
import { ProtocolClient } from "./protocolClient.js";
import type { WasmProtocolClient } from "./wasmClient.js";

const encoder = new TextEncoder();

function fakeWasm(responses: Uint8Array[]): WasmProtocolClient {
	return {
		async request(): Promise<Uint8Array> {
			const response = responses.shift();
			assert(response !== undefined);
			return response;
		},
		async readProjected() {
			return { operations: [], hasMore: false };
		},
		async resolveSubmission() {
			return { kind: "notCommitted" };
		},
		async uploadBlob(payload) {
			return { digest: payload, sizeBytes: BigInt(payload.length), deduplicated: false };
		},
		async fetchBlob(digest) {
			return digest;
		},
		async publishSummary(entries) {
			return {
				digest: entries[0]?.blob ?? new Uint8Array(),
				entryCount: entries.length,
				persistedBytes: 0n,
				deduplicated: false,
			};
		},
		async fetchSummary() {
			return [];
		},
		disconnect() {},
		reconnect() {},
		wireBytes: 0n,
		peakResponseBytes: 0,
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
