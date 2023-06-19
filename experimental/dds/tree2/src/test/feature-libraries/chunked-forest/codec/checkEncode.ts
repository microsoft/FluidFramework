import {
	BufferFormat,
	EncoderCache,
	FieldEncoderShape,
	NodeEncoderShape,
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
	shape: NodeEncoderShape,
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
	shape: FieldEncoderShape,
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

	// Check decode
	const result = decode(chunk);
	assertChunkCursorEquals(result, tree);
	return chunk;
}
