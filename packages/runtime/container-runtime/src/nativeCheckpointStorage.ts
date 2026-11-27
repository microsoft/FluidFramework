/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { isRecord, type NativeCheckpoint } from "./nativeCheckpoint.js";

/** At most five attachment reads reconstruct any checkpoint. */
export const maxNativeCheckpointDepth = 4;
/** Bounds both reconstructed payloads and decompression allocations in this prototype. */
const maxPayloadBytes = 64 * 1024 * 1024;
const blockSize = 32;
const magic = [78, 67, 80, 2];

/** A literal or a byte range in the immediate base's materialized payload. */
type DeltaPart = string | readonly [number, number];

/** Materialized bytes for a possible delta base. */
export interface NativeCheckpointBase {
	readonly checkpoint: NativeCheckpoint;
	readonly bytes: Uint8Array;
}

/** Storage bytes and the dependency actually selected after compression. */
export interface EncodedNativeCheckpoint {
	readonly bytes: Uint8Array;
	readonly baseId?: string;
	readonly depth: number;
}

/** Hashes a fixed block; matches are always verified byte-for-byte. */
function hashBlock(bytes: Uint8Array, start: number): number {
	let hash = 0;
	for (let index = start; index < start + blockSize; index++) {
		hash = (Math.imul(hash, 31) + bytes[index]) % 2147483647;
	}
	return hash;
}

/**
 * Copies unchanged ranges despite insertions, deletions, or moved subtrees.
 * Index only aligned base blocks and keep one candidate per hash to bound memory and collision work.
 * Scan every target offset, so edits do not force all subsequent blocks into literals.
 */
function createDelta(base: Uint8Array, target: Uint8Array): DeltaPart[] {
	const index = new Map<number, number>();
	for (let offset = 0; offset + blockSize <= base.length; offset += blockSize) {
		index.set(hashBlock(base, offset), offset);
	}
	const parts: DeltaPart[] = [];
	let literalStart = 0;
	let position = 0;
	while (position + blockSize <= target.length) {
		const offset = index.get(hashBlock(target, position));
		let length = 0;
		if (offset !== undefined) {
			while (
				offset + length < base.length &&
				position + length < target.length &&
				base[offset + length] === target[position + length]
			) {
				length++;
			}
		}
		if (offset === undefined || length < blockSize) {
			position++;
			continue;
		}
		if (position > literalStart) {
			parts.push(bufferToString(target.subarray(literalStart, position), "base64"));
		}
		parts.push([offset, length]);
		position += length;
		literalStart = position;
	}
	if (literalStart < target.length) {
		parts.push(bufferToString(target.subarray(literalStart), "base64"));
	}
	return parts;
}

/** Computes an integrity digest of the complete materialized payload, not just its delta. */
async function getDigest(bytes: Uint8Array): Promise<string> {
	return bufferToString(
		await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
		"base64",
	);
}

/** Reads a stream without permitting an unbounded decompression allocation. */
async function readStream(
	stream: ReadableStream<Uint8Array>,
	limit: number,
): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) {
				break;
			}
			length += next.value.byteLength;
			if (length > limit) {
				throw new UsageError("Native checkpoint exceeds size limit");
			}
			chunks.push(next.value);
		}
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}
	const result = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}

/** Compresses only after diffing; retain plain bytes when compression increases size. */
async function encodeEnvelope(value: unknown): Promise<Uint8Array> {
	const plain = new TextEncoder().encode(JSON.stringify(value));
	if (plain.length > maxPayloadBytes) {
		throw new UsageError("Native checkpoint exceeds size limit");
	}
	const compressed = await readStream(
		new Blob([plain]).stream().pipeThrough(new CompressionStream("gzip")),
		maxPayloadBytes + 1024 * 1024,
	);
	const payload = compressed.length < plain.length ? compressed : plain;
	const result = new Uint8Array(9 + payload.length);
	result.set(magic);
	result[4] = payload === plain ? 0 : 1;
	new DataView(result.buffer).setUint32(5, plain.length);
	result.set(payload, 9);
	return result;
}

/**
 * Selects the smaller stored representation, not the smaller uncompressed delta.
 * Periodic independent anchors bound random reads and retention amplification.
 */
export async function encodeNativeCheckpointStorage(
	bytes: Uint8Array,
	base?: NativeCheckpointBase,
): Promise<EncodedNativeCheckpoint> {
	if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") {
		throw new UsageError(
			"Native checkpoints require gzip CompressionStream and DecompressionStream support",
		);
	}
	if (bytes.length > maxPayloadBytes) {
		throw new UsageError("Native checkpoint exceeds size limit");
	}
	const hash = await getDigest(bytes);
	const full = await encodeEnvelope({
		version: 2,
		hash,
		length: bytes.length,
		content: bufferToString(bytes, "base64"),
	});
	const depth = (base?.checkpoint.depth ?? 0) + 1;
	if (base === undefined || depth > maxNativeCheckpointDepth) {
		return { bytes: full, depth: 0 };
	}
	const delta = await encodeEnvelope({
		version: 2,
		hash,
		length: bytes.length,
		baseId: base.checkpoint.id,
		baseHash: await getDigest(base.bytes),
		parts: createDelta(base.bytes, bytes),
	});
	return delta.length < full.length
		? { bytes: delta, baseId: base.checkpoint.id, depth }
		: { bytes: full, depth: 0 };
}

/** Decodes the storage frame; legacy uncompressed JSON remains readable. */
async function decodeEnvelope(bytes: Uint8Array): Promise<unknown> {
	if (!magic.every((byte, index) => bytes[index] === byte)) {
		return undefined;
	}
	if (bytes.length < 9) {
		throw new UsageError("Truncated native checkpoint");
	}
	const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(5);
	if (length > maxPayloadBytes) {
		throw new UsageError("Native checkpoint exceeds size limit");
	}
	const payload = bytes.subarray(9);
	let plain: Uint8Array;
	switch (bytes[4]) {
		case 0: {
			plain = payload;
			break;
		}
		case 1: {
			if (typeof DecompressionStream === "undefined") {
				throw new UsageError("Native checkpoints require gzip DecompressionStream support");
			}
			plain = await readStream(
				new Blob([new Uint8Array(payload)])
					.stream()
					.pipeThrough(new DecompressionStream("gzip")),
				length,
			);
			break;
		}
		default: {
			throw new UsageError("Unsupported native checkpoint compression");
		}
	}
	if (plain.length !== length) {
		throw new UsageError("Invalid native checkpoint frame length");
	}
	return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(plain));
}

/**
 * Reconstructs a checkpoint independently of a warm client cache.
 * Catalog dependencies, frame references, lengths and both digests must agree.
 */
export async function loadNativeCheckpointBytes(
	checkpoint: NativeCheckpoint,
	checkpoints: readonly NativeCheckpoint[],
	read: (route: string) => Promise<ArrayBufferLike>,
): Promise<Uint8Array> {
	const visiting = new Set<string>();
	async function load(entry: NativeCheckpoint): Promise<Uint8Array> {
		if (visiting.has(entry.id) || visiting.size > maxNativeCheckpointDepth) {
			throw new UsageError("Invalid native checkpoint dependency chain");
		}
		visiting.add(entry.id);
		const stored = new Uint8Array(await read(entry.route));
		if (stored.length !== entry.bytes || stored.length > maxPayloadBytes + 9) {
			throw new UsageError("Invalid native checkpoint storage length");
		}
		const value = await decodeEnvelope(stored);
		if (value === undefined && entry.baseId === undefined && (entry.depth ?? 0) === 0) {
			return stored;
		}
		if (
			!isRecord(value) ||
			value.version !== 2 ||
			typeof value.hash !== "string" ||
			typeof value.length !== "number" ||
			!Number.isSafeInteger(value.length) ||
			value.length < 0 ||
			value.length > maxPayloadBytes ||
			value.baseId !== entry.baseId
		) {
			throw new UsageError("Invalid native checkpoint storage envelope");
		}
		let result: Uint8Array;
		if (entry.baseId === undefined) {
			if (typeof value.content !== "string" || (entry.depth ?? 0) !== 0) {
				throw new UsageError("Invalid native checkpoint anchor");
			}
			result = new Uint8Array(stringToBuffer(value.content, "base64"));
		} else {
			const base = checkpoints.find((candidate) => candidate.id === entry.baseId);
			if (
				base === undefined ||
				entry.depth !== (base.depth ?? 0) + 1 ||
				!Array.isArray(value.parts)
			) {
				throw new UsageError("Missing or invalid native checkpoint base");
			}
			const baseBytes = await load(base);
			if ((await getDigest(baseBytes)) !== value.baseHash) {
				throw new UsageError("Native checkpoint base digest mismatch");
			}
			result = new Uint8Array(value.length);
			let offset = 0;
			for (const part of value.parts) {
				let bytes: Uint8Array;
				if (typeof part === "string") {
					bytes = new Uint8Array(stringToBuffer(part, "base64"));
				} else if (
					Array.isArray(part) &&
					part.length === 2 &&
					typeof part[0] === "number" &&
					typeof part[1] === "number" &&
					Number.isSafeInteger(part[0]) &&
					Number.isSafeInteger(part[1]) &&
					part[0] >= 0 &&
					part[1] > 0 &&
					part[0] + part[1] <= baseBytes.length
				) {
					bytes = baseBytes.subarray(part[0], part[0] + part[1]);
				} else {
					throw new UsageError("Invalid native checkpoint delta range");
				}
				if (offset + bytes.length > result.length) {
					throw new UsageError("Invalid native checkpoint delta length");
				}
				result.set(bytes, offset);
				offset += bytes.length;
			}
			if (offset !== result.length) {
				throw new UsageError("Truncated native checkpoint delta");
			}
		}
		if (result.length !== value.length || (await getDigest(result)) !== value.hash) {
			throw new UsageError("Native checkpoint digest mismatch");
		}
		return result;
	}
	return load(checkpoint);
}
