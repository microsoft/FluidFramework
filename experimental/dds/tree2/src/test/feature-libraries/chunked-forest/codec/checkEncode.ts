/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import {
	BufferFormat,
	EncoderCache,
	FieldEncoder,
	NodeEncoder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode";
// eslint-disable-next-line import/no-internal-modules
import { CounterFilter } from "../../../../feature-libraries/chunked-forest/codec/chunkCodecUtilities";
// eslint-disable-next-line import/no-internal-modules
import { handleShapesAndIdentifiers } from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric";
// eslint-disable-next-line import/no-internal-modules
import { EncodedChunk, version } from "../../../../feature-libraries/chunked-forest/codec/format";
import { JsonableTree } from "../../../../core";
import { assertChunkCursorEquals, fieldCursorFromJsonableTrees } from "../fieldCursorTestUtilities";
import { singleTextCursor } from "../../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { decode } from "../../../../feature-libraries/chunked-forest/codec/chunkDecoding";

export function checkNodeEncode(
	shape: NodeEncoder,
	cache: EncoderCache,
	tree: JsonableTree,
): BufferFormat {
	const buffer: BufferFormat = [shape.shape];
	const cursor = singleTextCursor(tree);
	shape.encodeNode(cursor, cache, buffer);

	// Check round-trip
	checkDecode(buffer, [tree]);

	return buffer.slice(1);
}

export function checkFieldEncode(
	shape: FieldEncoder,
	cache: EncoderCache,
	tree: JsonableTree[],
): BufferFormat {
	const buffer: BufferFormat = [shape.shape];
	const cursor = fieldCursorFromJsonableTrees(tree);
	shape.encodeField(cursor, cache, buffer);

	// Check round-trip
	checkDecode(buffer, tree);

	return buffer.slice(1);
}

function checkDecode(buffer: BufferFormat, tree: JsonableTree[]): void {
	// Check round-trips with identifiers inline and out of line
	testDecode(buffer, tree, () => false);
	testDecode(buffer, tree, () => true);
}

/**
 * Clones anything handleShapesAndIdentifiers might modify in-place.
 */
function cloneArrays<T>(data: readonly T[]): T[] {
	return data.map((item) => (Array.isArray(item) ? cloneArrays(item) : item)) as T[];
}

function testDecode(
	buffer: BufferFormat,
	tree: JsonableTree[],
	identifierFilter: CounterFilter<string>,
): EncodedChunk {
	const chunk = handleShapesAndIdentifiers(version, cloneArrays(buffer), identifierFilter);

	// TODO: check chunk matches schema

	// Check decode
	const result = decode(chunk);
	assertChunkCursorEquals(result, tree);

	// Confirm JSON compatibility
	{
		assertJsonish(chunk, new Set());
		const json = JSON.stringify(chunk);
		const parsed = JSON.parse(json);
		// can't check this due to undefined fields
		// assert.deepEqual(parsed, chunk);
		// Instead check that it works properly:
		const parsedResult = decode(parsed);
		assert.deepEqual(parsedResult, result);
	}

	return chunk;
}

/**
 * Checks that data is json compatible.
 *
 * This assumes that `undefined` fields are allowed as JSON will omit them.
 * If tolerating undefined fields is not desired, a similar check can be done by round-tripping through json instead.
 */
function assertJsonish(data: unknown, stack: Set<unknown>): void {
	switch (typeof data) {
		case "number":
			assert(Number.isFinite(data));
			assert(!Object.is(data, -0));
			return;
		case "string":
		// TODO: could test that string is valid unicode here.
		case "boolean":
			return;
		case "object": {
			if (data === null) {
				return;
			}
			assert(!stack.has(data));
			stack.add(data);
			try {
				if (Array.isArray(data)) {
					for (const item of data) {
						assertJsonish(item, stack);
					}
				}
				const prototype = Reflect.getPrototypeOf(data);
				if (prototype !== Object && prototype === null) {
					fail();
				}

				for (const key of Reflect.ownKeys(data)) {
					assert(typeof key === "string");
					const value = Reflect.get(data, key);
					if (value !== undefined) {
						// TODO: could check for feature detection pattern, used for IFluidHandle
						assertJsonish(value, stack);
					}
				}
				return;
			} finally {
				stack.delete(data);
			}
		}
		default:
			fail();
	}
}
