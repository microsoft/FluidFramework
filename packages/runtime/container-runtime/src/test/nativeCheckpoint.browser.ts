/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";

import {
	decodeNativeCheckpoint,
	encodeNativeCheckpoint,
	type NativeCheckpoint,
} from "../nativeCheckpoint.js";
import {
	encodeNativeCheckpointStorage,
	loadNativeCheckpointBytes,
	type NativeCheckpointBase,
} from "../nativeCheckpointStorage.js";

/**
 * Runs the production checkpoint codec in a browser without Node.js shims or service credentials.
 * Bundle this entry for the browser and call it from nativeCheckpoint.browser.html.
 */
export async function runNativeCheckpointBrowserSmoke(): Promise<{
	readonly passed: true;
	readonly userAgent: string;
	readonly checkpoints: number;
	readonly maxReads: number;
	readonly archiveBytes: number;
	readonly durationMs: number;
}> {
	const start = performance.now();
	const checkpoints: NativeCheckpoint[] = [];
	const blobs = new Map<string, Uint8Array>();
	const expected: Uint8Array[] = [];
	let base: NativeCheckpointBase | undefined;
	let random = 17;
	const content = Uint8Array.from({ length: 32768 }, () => {
		random = (random * 1664525 + 1013904223) % 4294967296;
		return Math.floor(random / 16777216);
	});
	for (let index = 0; index < 12; index++) {
		content.fill(index, index * 64, index * 64 + 32);
		const bytes = encodeNativeCheckpoint({
			type: SummaryType.Tree,
			tree: {
				body: { type: SummaryType.Blob, content },
				image: { type: SummaryType.Attachment, id: "shared-original-image" },
			},
		});
		const encoded = await encodeNativeCheckpointStorage(bytes, base);
		const checkpoint: NativeCheckpoint = {
			id: String(index),
			sequenceNumber: index,
			route: `/_blobs/browser-${index}`,
			bytes: encoded.bytes.length,
			assets: ["/_blobs/shared-original-image"],
			baseId: encoded.baseId,
			depth: encoded.depth,
		};
		checkpoints.push(checkpoint);
		expected.push(bytes);
		blobs.set(checkpoint.route, encoded.bytes);
		base = { checkpoint, bytes };
	}
	assert(
		checkpoints.some((checkpoint) => checkpoint.depth === 4),
		"Exercise bounded deltas",
	);
	let maxReads = 0;
	for (const [index, checkpoint] of checkpoints.entries()) {
		let reads = 0;
		const bytes = await loadNativeCheckpointBytes(checkpoint, checkpoints, async (route) => {
			reads++;
			const blob = blobs.get(route);
			assert(blob !== undefined, "Every dependency must be present");
			return blob.buffer;
		});
		const original = expected[index];
		assert(original?.length === bytes.length, "Preserve payload length");
		assert(
			bytes.every((value, offset) => value === original[offset]),
			"Preserve exact native bytes",
		);
		const image: SummaryObject | undefined = decodeNativeCheckpoint(bytes.buffer).tree.image;
		assert(
			image?.type === SummaryType.Attachment && image.id === "shared-original-image",
			"Reuse original attachment",
		);
		assert(reads <= 5, "Bound cold reconstruction reads");
		maxReads = Math.max(maxReads, reads);
	}
	const last = checkpoints.at(-1);
	assert(last !== undefined, "Have a checkpoint to corrupt");
	const damaged = blobs.get(last.route);
	assert(damaged !== undefined, "Have stored bytes");
	const lastByte = damaged.at(-1);
	assert(lastByte !== undefined, "Expected a stored browser checkpoint");
	damaged[damaged.length - 1] = (lastByte + 1) % 256;
	let rejected = false;
	try {
		await loadNativeCheckpointBytes(last, checkpoints, async (route) => {
			const blob = blobs.get(route);
			assert(blob !== undefined, "Have dependency bytes");
			return blob.buffer;
		});
	} catch {
		rejected = true;
	}
	assert(rejected, "Reject damaged gzip or integrity data");
	return {
		passed: true,
		userAgent: navigator.userAgent,
		checkpoints: checkpoints.length,
		maxReads,
		archiveBytes: checkpoints.reduce((total, checkpoint) => total + checkpoint.bytes, 0),
		durationMs: performance.now() - start,
	};
}
