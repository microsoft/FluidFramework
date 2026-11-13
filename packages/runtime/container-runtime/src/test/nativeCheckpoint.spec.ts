/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import {
	decodeNativeCheckpoint,
	encodeNativeCheckpoint,
	parseNativeCheckpointState,
	selectRetainedNativeCheckpoints,
	type NativeCheckpoint,
} from "../nativeCheckpoint.js";
import {
	encodeNativeCheckpointStorage,
	loadNativeCheckpointBytes,
	maxNativeCheckpointDepth,
} from "../nativeCheckpointStorage.js";
import { stub } from "sinon";

describe("Native checkpoint encoding", () => {
	it("round-trips binary blobs, text, attachment references and unreferenced trees", () => {
		const tree: ISummaryTree = {
			type: SummaryType.Tree,
			tree: {
				text: { type: SummaryType.Blob, content: '{"binary":[256],"content":"user data"}' },
				binary: { type: SummaryType.Blob, content: new Uint8Array([0, 128, 255]) },
				image: { type: SummaryType.Attachment, id: "original-image-id" },
				unused: { type: SummaryType.Tree, unreferenced: true, tree: {} },
			},
		};
		assert.deepEqual(decodeNativeCheckpoint(encodeNativeCheckpoint(tree).buffer), tree);
	});

	describe("Native checkpoint delta storage", () => {
		function createNoise(length: number): Uint8Array {
			let state = 123456;
			return Uint8Array.from({ length }, () => {
				state = (state * 1664525 + 1013904223) % 4294967296;
				return Math.floor(state / 16777216);
			});
		}

		function createStore() {
			const checkpoints: NativeCheckpoint[] = [];
			const blobs = new Map<string, Uint8Array>();
			const originals = new Map<string, Uint8Array>();
			async function read(route: string): Promise<ArrayBufferLike> {
				const bytes = blobs.get(route);
				assert(bytes !== undefined, `Missing ${route}`);
				return new Uint8Array(bytes).buffer;
			}
			async function store(bytes: Uint8Array): Promise<NativeCheckpoint> {
				const previous = checkpoints.at(-1);
				const previousBytes = previous === undefined ? undefined : originals.get(previous.id);
				const encoded = await encodeNativeCheckpointStorage(
					bytes,
					previous === undefined || previousBytes === undefined
						? undefined
						: { checkpoint: previous, bytes: previousBytes },
				);
				const id = `${checkpoints.length}`;
				const checkpoint: NativeCheckpoint = {
					id,
					sequenceNumber: checkpoints.length,
					route: `/_blobs/${id}`,
					bytes: encoded.bytes.length,
					assets: [],
					baseId: encoded.baseId,
					depth: encoded.depth,
				};
				checkpoints.push(checkpoint);
				blobs.set(checkpoint.route, encoded.bytes);
				originals.set(id, new Uint8Array(bytes));
				return checkpoint;
			}
			return { checkpoints, blobs, originals, read, store };
		}

		it("bounds cold random access across inserts, deletes, moves and independent anchors", async () => {
			const storage = createStore();
			let bytes = createNoise(16000);
			let fullBytes = 0;
			for (let iteration = 0; iteration < 16; iteration++) {
				// Different offsets, a moved block, inserted Unicode, and deleted bytes.
				bytes = new Uint8Array([
					...bytes.subarray(4000, 5000),
					...bytes.subarray(0, 2000),
					...new TextEncoder().encode(`edit ${iteration} 🌳`),
					...bytes.subarray(2017, 4000),
					...bytes.subarray(5000),
				]);
				await storage.store(bytes);
				const independent = await encodeNativeCheckpointStorage(bytes);
				fullBytes += independent.bytes.length;
			}
			assert(
				storage.checkpoints.some(
					(checkpoint) => checkpoint.depth === maxNativeCheckpointDepth,
				),
			);
			assert(storage.checkpoints.filter((checkpoint) => checkpoint.depth === 0).length >= 4);
			assert(
				storage.checkpoints.reduce((total, checkpoint) => total + checkpoint.bytes, 0) <
					fullBytes / 2,
			);
			for (const position of [15, 2, 9, 0, 7, 4, 12]) {
				const checkpoint = storage.checkpoints[position];
				let reads = 0;
				const actual = await loadNativeCheckpointBytes(
					checkpoint,
					storage.checkpoints,
					async (route) => {
						reads++;
						return storage.read(route);
					},
				);
				assert.deepEqual(actual, storage.originals.get(checkpoint.id));
				assert.equal(reads, (checkpoint.depth ?? 0) + 1);
			}
		});

		it("retains dependency closure and the restore boundary without retaining unrelated image roots", async () => {
			const storage = createStore();
			const bytes = createNoise(12000);
			for (let index = 0; index < 8; index++) {
				bytes[index] = index;
				await storage.store(bytes);
			}
			const checkpoints = storage.checkpoints.map((entry) => ({
				...entry,
				assets: [`/_blobs/image-${entry.id}`],
			}));
			const state = {
				version: 1,
				checkpoints,
				restored: { id: "restore", checkpointId: "2", sequenceNumber: 9 },
			} satisfies import("../nativeCheckpoint.js").NativeCheckpointState;
			const retained = selectRetainedNativeCheckpoints(state, ["6"]);
			assert.deepEqual(
				retained.map((entry) => entry.id),
				["0", "1", "2", "5", "6"],
			);
			assert(!retained.flatMap((entry) => entry.assets).includes("/_blobs/image-3"));
			assert.doesNotThrow(() =>
				parseNativeCheckpointState({ ...state, checkpoints: retained }),
			);
			const last = retained.at(-1);
			assert(last !== undefined);
			assert.deepEqual(
				await loadNativeCheckpointBytes(last, retained, storage.read),
				storage.originals.get("6"),
			);
			assert.deepEqual(selectRetainedNativeCheckpoints({ version: 1, checkpoints }, []), []);
			assert.throws(
				() => parseNativeCheckpointState({ version: 1, checkpoints: [checkpoints[1]] }),
				/dependency/,
			);
		});

		it("rejects missing bases, wrong depths, corrupted anchors and truncated frames", async () => {
			const storage = createStore();
			const bytes = createNoise(12000);
			const base = await storage.store(bytes);
			bytes[4000] = (bytes[4000] + 1) % 256;
			const delta = await storage.store(bytes);
			assert.equal(delta.baseId, base.id);
			await assert.rejects(loadNativeCheckpointBytes(delta, [delta], storage.read), /base/);
			await assert.rejects(
				loadNativeCheckpointBytes({ ...delta, depth: 4 }, storage.checkpoints, storage.read),
				/base/,
			);
			const original = storage.blobs.get(base.route);
			assert(original !== undefined);
			storage.blobs.set(base.route, original.subarray(0, -1));
			await assert.rejects(
				loadNativeCheckpointBytes(delta, storage.checkpoints, storage.read),
				/length/,
			);
			const altered = new Uint8Array(original);
			altered[altered.length - 10] = (altered[altered.length - 10] + 1) % 256;
			storage.blobs.set(base.route, altered);
			await assert.rejects(
				loadNativeCheckpointBytes(delta, storage.checkpoints, storage.read),
			);
		});

		it("rejects forged ranges, lengths, base hashes and result hashes before returning content", async () => {
			const storage = createStore();
			const bytes = createNoise(12000);
			const base = await storage.store(bytes);
			const hash = Buffer.from(
				await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
			).toString("base64");
			const envelope = {
				version: 2,
				baseId: base.id,
				baseHash: hash,
				hash,
				length: bytes.length,
				parts: [[0, bytes.length]],
			};
			for (const change of [
				{ parts: [[-1, bytes.length]] },
				{ parts: [[0, bytes.length + 1]] },
				{ parts: [[0, 0]] },
				{ parts: [[0, bytes.length - 1]] },
				{ length: bytes.length - 1 },
				{ baseHash: "wrong base" },
				{ hash: "wrong result" },
			]) {
				const plain = new TextEncoder().encode(JSON.stringify({ ...envelope, ...change }));
				const frame = new Uint8Array(9 + plain.length);
				frame.set([78, 67, 80, 2, 0]);
				new DataView(frame.buffer).setUint32(5, plain.length);
				frame.set(plain, 9);
				const delta: NativeCheckpoint = {
					id: "forged",
					route: "/_blobs/forged",
					sequenceNumber: 1,
					bytes: frame.length,
					assets: [],
					baseId: base.id,
					depth: 1,
				};
				storage.blobs.set(delta.route, frame);
				await assert.rejects(loadNativeCheckpointBytes(delta, [base, delta], storage.read));
			}
		});

		it("falls back to existing LZ4 without CompressionStream and reads legacy JSON", async () => {
			const compression = stub(globalThis, "CompressionStream").value(undefined);
			const storage = createStore();
			try {
				const bytes = new TextEncoder().encode("repetitive text ".repeat(1000));
				const compressedCheckpoint = await storage.store(bytes);
				assert.equal(storage.blobs.get(compressedCheckpoint.route)?.[4], 2);
				assert.deepEqual(
					await loadNativeCheckpointBytes(
						compressedCheckpoint,
						storage.checkpoints,
						storage.read,
					),
					bytes,
				);
			} finally {
				compression.restore();
			}
			const legacy = new TextEncoder().encode(
				JSON.stringify({
					version: 1,
					summary: {
						type: SummaryType.Tree,
						tree: { binary: { type: SummaryType.Blob, binary: [1, 255] } },
					},
				}),
			);
			const checkpoint: NativeCheckpoint = {
				id: "legacy",
				sequenceNumber: 0,
				route: "/_blobs/legacy",
				bytes: legacy.length,
				assets: [],
			};
			const loaded = await loadNativeCheckpointBytes(
				checkpoint,
				[checkpoint],
				async () => legacy.buffer,
			);
			assert.deepEqual(decodeNativeCheckpoint(loaded.buffer), {
				type: SummaryType.Tree,
				tree: { binary: { type: SummaryType.Blob, content: new Uint8Array([1, 255]) } },
			});
		});
	});

	it("rejects incremental handles and loading groups instead of losing content", () => {
		assert.throws(
			() =>
				encodeNativeCheckpoint({
					type: SummaryType.Tree,
					tree: {
						old: { type: SummaryType.Handle, handleType: SummaryType.Tree, handle: "/old" },
					},
				}),
			/summary handles/,
		);
		assert.throws(
			() =>
				encodeNativeCheckpoint({
					type: SummaryType.Tree,
					groupId: "unloaded",
					tree: {},
				}),
			/ungrouped/,
		);
	});

	it("rejects invalid binary bytes and unsupported formats", () => {
		for (const content of [
			{ version: 2, summary: {} },
			{ version: 1, summary: { type: SummaryType.Blob, binary: [-1] } },
			{ version: 1, summary: { type: SummaryType.Blob, binary: [1.5] } },
		]) {
			assert.throws(() =>
				decodeNativeCheckpoint(new TextEncoder().encode(JSON.stringify(content)).buffer),
			);
		}
	});
});
