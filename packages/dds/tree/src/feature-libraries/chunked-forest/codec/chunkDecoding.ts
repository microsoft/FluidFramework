/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase, oob } from "@fluidframework/core-utils/internal";
import type {
	OpSpaceCompressedId,
	SessionSpaceCompressedId,
} from "@fluidframework/id-compressor";

import { DiscriminatedUnionDispatcher } from "../../../codec/index.js";
import type {
	FieldKey,
	TreeNodeSchemaIdentifier,
	Value,
	TreeChunk,
} from "../../../core/index.js";
import {
	assertValidIndex,
	brand,
	decompressIdentifierIfNeeded,
	type IdDecodingContext,
} from "../../../util/index.js";
import { BasicChunk } from "../basicChunk.js";
import { emptyChunk } from "../emptyChunk.js";
import { SequenceChunk } from "../sequenceChunk.js";

import {
	type ChunkDecoder,
	type StreamCursor,
	getChecked,
	readStream,
	readStreamBoolean,
	readStreamNumber,
	readStreamStream,
	readStreamValue,
} from "./chunkCodecUtilities.js";
import {
	DecoderContext,
	decode as genericDecode,
	readStreamIdentifier,
} from "./chunkDecodingGeneric.js";
import type { IncrementalDecoder } from "./codecs.js";
import {
	type EncodedAnyShape,
	type EncodedChunkShape,
	type EncodedChunkShapeV2,
	type EncodedFieldBatchV1OrV2,
	type EncodedFieldBatchV2,
	type EncodedIncrementalChunkShape,
	type EncodedInlineArrayShape,
	type EncodedNestedArrayShape,
	type EncodedNodeShape,
	type EncodedSpecializedNodeShape,
	type EncodedValueShape,
	type ShapeIndex,
	SpecialField,
	supportsIncrementalEncoding,
} from "./format/index.js";

/**
 * Decode `chunk` into a TreeChunk.
 */
export function decode(
	chunk: EncodedFieldBatchV1OrV2,
	idDecodingContext: IdDecodingContext,
	incrementalDecoder?: IncrementalDecoder,
): TreeChunk[] {
	return genericDecode(
		decoderLibrary,
		new DecoderContext(chunk.identifiers, chunk.shapes, idDecodingContext, incrementalDecoder),
		chunk,
		anyDecoder,
	);
}

/**
 * Resolves `shapeIndex` to a fully-resolved {@link EncodedNodeShape}, normalizing away any
 * specialized node shapes (`f`) along the way by applying their overlays via
 * {@link applySpecialization} until a concrete node shape is reached.
 *
 * @param input - The index of the shape to resolve, which must be a concrete or specialized node shape.
 * @param context - The decoding context containing the shape definitions.
 * @param pendingResolution - (Internal) A set of shape indices visited so far in the current resolution chain, used to detect cycles in the specialization chain. Most callers should not provide this argument.
 *
 * @remarks
 * Exported for testing.
 */
export function normalizeToNodeShape(
	input: EncodedNodeShape | EncodedSpecializedNodeShape,
	context: DecoderContext<EncodedChunkShape>,
	pendingResolution: Set<ShapeIndex> = new Set(),
): EncodedNodeShape {
	if (!("base" in input)) {
		return input;
	}

	const baseIndex = input.base;
	assert(!pendingResolution.has(baseIndex), 0xcfb /* cyclic specialized node shape chain */);
	pendingResolution.add(baseIndex);
	const encoded = context.shapes[baseIndex];
	assert(encoded !== undefined, 0xcfc /* shape index out of bounds */);

	const baseShape = encoded.c ?? ("f" in encoded ? encoded.f : undefined);
	assert(
		baseShape !== undefined,
		0xcfd /* shape at index must be a concrete (c) or specialized (f) node shape */,
	);

	return applySpecialization(
		normalizeToNodeShape(baseShape, context, pendingResolution),
		input,
		context,
	);
}

/**
 * Produces a specialized {@link EncodedNodeShape} by overlaying `overrides` onto `base`.
 *
 * See {@link EncodedSpecializedNodeShape} for the override/inherit/clear semantics.
 *
 * @remarks
 * Exported for testing.
 */
export function applySpecialization(
	base: EncodedNodeShape,
	overrides: EncodedSpecializedNodeShape,
	context: DecoderContext<EncodedChunkShape>,
): EncodedNodeShape {
	const fields = [...(base.fields ?? [])];
	const indexFromKey = new Map<FieldKey, number>();
	for (const [i, [keyEncoded]] of fields.entries()) {
		const key = context.identifier<FieldKey>(keyEncoded);
		assert(!indexFromKey.has(key), 0xcfe /* duplicate field key in base node shape */);
		indexFromKey.set(key, i);
	}

	// Replace fields in base with overrides, append new keys in overrides in the order they are specified.
	const seenOverrideKeys = new Set<FieldKey>();
	for (const [keyEncoded, shapeIndex] of overrides.fields ?? []) {
		const key = context.identifier<FieldKey>(keyEncoded);
		assert(
			!seenOverrideKeys.has(key),
			0xcff /* duplicate field key in specialized node shape */,
		);
		seenOverrideKeys.add(key);
		const existingIndex = indexFromKey.get(key);
		if (existingIndex === undefined) {
			fields.push([keyEncoded, shapeIndex]);
		} else {
			const index = fields[existingIndex];
			assert(index !== undefined, 0xd00 /* expected existing field index */);
			fields[existingIndex] = [index[0], shapeIndex];
		}
	}

	return {
		type: base.type,
		value: resolveOverride(overrides.value, base.value),
		fields: fields.length > 0 ? fields : undefined,
		extraFields: resolveOverride(overrides.extraFields, base.extraFields),
	};
}

/**
 * Resolves an override against a base value.
 *
 * @param override - `undefined` means the override is absent (inherit from base); `null` is the
 * explicit-clear sentinel needed because JSON.stringify drops `undefined`-valued properties, making
 * property-presence indistinguishable from absent on the wire.
 * @param baseValue - The value to inherit when the override is absent.
 */
function resolveOverride<T>(
	// eslint-disable-next-line @rushstack/no-new-null
	override: T | null | undefined,
	baseValue: T | undefined,
): T | undefined {
	if (override === undefined) {
		return baseValue;
	}
	if (override === null) {
		return undefined;
	}
	return override;
}

/**
 * Decoder for {@link EncodedSpecializedNodeShape}s.
 * Applies the specialization's field overrides to the resolved base node shape, then delegates
 * to a {@link NodeDecoder} built from the resulting shape.
 */
export class SpecializedNodeDecoder implements ChunkDecoder {
	private readonly inner: NodeDecoder;
	public constructor(
		shape: EncodedSpecializedNodeShape,
		context: DecoderContext<EncodedChunkShape>,
	) {
		this.inner = new NodeDecoder(normalizeToNodeShape(shape, context), context);
	}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		return this.inner.decode(decoders, stream);
	}
}

const decoderLibrary = new DiscriminatedUnionDispatcher<
	EncodedChunkShape,
	[context: DecoderContext<EncodedChunkShape>],
	ChunkDecoder
>({
	a(shape: EncodedNestedArrayShape, context): ChunkDecoder {
		return new NestedArrayDecoder(shape);
	},
	b(shape: EncodedInlineArrayShape, context): ChunkDecoder {
		return new InlineArrayDecoder(shape);
	},
	c(shape: EncodedNodeShape, context): ChunkDecoder {
		return new NodeDecoder(shape, context);
	},
	d(shape: EncodedAnyShape): ChunkDecoder {
		return anyDecoder;
	},
	e(
		shape: EncodedIncrementalChunkShape,
		context: DecoderContext<EncodedChunkShapeV2>,
	): ChunkDecoder {
		return new IncrementalChunkDecoder(context);
	},
	f(shape: EncodedSpecializedNodeShape, context): ChunkDecoder {
		return new SpecializedNodeDecoder(shape, context);
	},
});

/**
 * Decode a node's value from `stream` using its shape.
 */
export function readValue(
	stream: StreamCursor,
	shape: EncodedValueShape,
	idDecodingContext: IdDecodingContext,
): Value {
	if (shape === undefined) {
		return readStreamBoolean(stream) ? readStreamValue(stream) : undefined;
	} else {
		if (shape === true) {
			return readStreamValue(stream);
		} else if (shape === false) {
			return undefined;
		} else if (Array.isArray(shape)) {
			assert(shape.length === 1, 0x734 /* expected a single constant for value */);
			return shape[0] as Value;
		} else if (shape === SpecialField.Identifier) {
			// This case is a special case handling the decoding of identifier fields.
			const streamValue = readStream(stream);
			assert(
				typeof streamValue === "number" || typeof streamValue === "string",
				0x997 /* identifier must be string or number. */,
			);
			// Strings (StableId UUIDs, heal-synthesized v5 UUIDs, or arbitrary user
			// identifier strings) are already in the stored form and pass through.
			// Op-space compressed ids are resolved by the caller-supplied
			// `resolveEncodedId`, which encapsulates the originator lookup, finalized-id
			// normalization, and (for the forest summarizer's heal path) UUIDv5 synthesis.
			const sessionIdOrString: SessionSpaceCompressedId | string =
				typeof streamValue === "string"
					? streamValue
					: idDecodingContext.resolveEncodedId(streamValue as OpSpaceCompressedId);
			// Performance:
			// Currently, we just fully expand the identifier here rather than keeping it in the SessionSpaceCompressedId format.
			// Avoiding this expansion, and keeping the in memory format using SessionSpaceCompressedId would be a good optimization for the future.
			// Keeping this optimization possible is why `resolveEncodedId` doesn't simply return a string.
			return decompressIdentifierIfNeeded(sessionIdOrString, idDecodingContext.idCompressor);
		} else {
			// EncodedCounter case:
			unreachableCase(shape, "decoding values as deltas is not yet supported");
		}
	}
}

/**
 * Normalize a {@link TreeChunk} into an array.
 *
 * Unwraps {@link SequenceChunk}s, and wraps other chunks.
 */
export function deaggregateChunks(chunk: TreeChunk): TreeChunk[] {
	if (chunk === emptyChunk) {
		return [];
	}
	// TODO: when handling of SequenceChunks has better performance (for example in cursors),
	// consider keeping SequenceChunks here if they are longer than some threshold.
	if (chunk instanceof SequenceChunk) {
		// Could return [] here, however the logic in this file is designed to never produce an empty SequenceChunk, so its better to throw an error here to detect bugs.
		assert(chunk.subChunks.length > 0, 0x735 /* Unexpected empty sequence */);
		// Logic in this file is designed to never produce an unneeded (single item) SequenceChunks, so its better to throw an error here to detect bugs.
		assert(chunk.subChunks.length > 1, 0x736 /* Unexpected single item sequence */);

		for (const sub of chunk.subChunks) {
			// The logic in this file is designed to never produce an nested SequenceChunks or emptyChunk, so its better to throw an error here to detect bugs.
			assert(!(sub instanceof SequenceChunk), 0x737 /* unexpected nested sequence */);
			assert(sub !== emptyChunk, 0x738 /* unexpected empty chunk */);

			sub.referenceAdded();
		}

		chunk.referenceRemoved();
		return chunk.subChunks;
	} else {
		return [chunk];
	}
}

/**
 * Normalize a {@link TreeChunk}[] into a single TreeChunk.
 *
 * Avoids creating nested or less than 2 child {@link SequenceChunk}s.
 */
export function aggregateChunks(input: TreeChunk[]): TreeChunk {
	const chunks = input.flatMap(deaggregateChunks);
	switch (chunks.length) {
		case 0: {
			return emptyChunk;
		}
		case 1: {
			return chunks[0] ?? oob();
		}
		default: {
			return new SequenceChunk(chunks);
		}
	}
}

/**
 * Decoder for {@link EncodedNestedArrayShape}s.
 */
export class NestedArrayDecoder implements ChunkDecoder {
	public constructor(private readonly shape: EncodedNestedArrayShape) {}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const decoder = decoders[this.shape] ?? oob();

		// TODO: uniform chunk fast path
		const chunks: TreeChunk[] = [];

		const data = readStream(stream);
		if (typeof data === "number") {
			// This case means that the array contained only 0-sized items, and was thus encoded as the length of the array.
			const inner = { data: [], offset: 0 };
			for (let index = 0; index < data; index++) {
				chunks.push(decoder.decode(decoders, inner));
			}
		} else {
			assert(
				Array.isArray(data),
				0x739 /* expected number of array for encoding of nested array */,
			);
			const inner = { data, offset: 0 };
			while (inner.offset !== inner.data.length) {
				chunks.push(decoder.decode(decoders, inner));
			}
		}

		return aggregateChunks(chunks);
	}
}

/**
 * Decoder for {@link EncodedInlineArrayShape}s.
 */
export class InlineArrayDecoder implements ChunkDecoder {
	public constructor(private readonly shape: EncodedInlineArrayShape) {}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const length = this.shape.length;
		const decoder = decoders[this.shape.shape] ?? oob();
		const chunks: TreeChunk[] = [];
		for (let index = 0; index < length; index++) {
			chunks.push(decoder.decode(decoders, stream));
		}
		return aggregateChunks(chunks);
	}
}

/**
 * Decoder for {@link EncodedIncrementalChunkShape}s.
 */
export class IncrementalChunkDecoder implements ChunkDecoder {
	public constructor(private readonly context: DecoderContext<EncodedChunkShapeV2>) {}
	public decode(_: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		assert(
			this.context.incrementalDecoder !== undefined,
			0xc27 /* incremental decoder not available for incremental field decoding */,
		);

		const chunkDecoder = (batch: EncodedFieldBatchV2): TreeChunk => {
			assert(
				supportsIncrementalEncoding(batch.version),
				0xc9f /* Unsupported FieldBatchFormatVersion for incremental chunks; must be v2 or higher */,
			);
			const context = new DecoderContext(
				batch.identifiers,
				batch.shapes,
				this.context.idDecodingContext,
				this.context.incrementalDecoder,
			);
			const chunks = genericDecode(decoderLibrary, context, batch, anyDecoder);
			return aggregateChunks(chunks);
		};

		const chunkReferenceId = readStreamNumber(stream);
		return this.context.incrementalDecoder.decodeIncrementalChunk(
			brand(chunkReferenceId),
			chunkDecoder,
		);
	}
}

/**
 * Decoder for {@link EncodedAnyShape}s.
 */
export const anyDecoder: ChunkDecoder = {
	decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const shapeIndex = readStreamNumber(stream);
		const decoder = getChecked(decoders, shapeIndex);
		return decoder.decode(decoders, stream);
	},
};

/**
 * Decoder for field.
 */
type BasicFieldDecoder = (
	decoders: readonly ChunkDecoder[],
	stream: StreamCursor,
) => [FieldKey, TreeChunk];

/**
 * Get a decoder for fields of a provided (via `shape` and `context`).
 */
function fieldDecoder(
	context: DecoderContext<EncodedChunkShape>,
	key: FieldKey,
	shape: number,
): BasicFieldDecoder {
	assertValidIndex(shape, context.shapes);
	return (decoders, stream) => {
		const decoder = decoders[shape] ?? oob();
		return [key, decoder.decode(decoders, stream)];
	};
}

/**
 * Decoder for {@link EncodedNodeShape}s.
 */
export class NodeDecoder implements ChunkDecoder {
	private readonly type?: TreeNodeSchemaIdentifier;
	private readonly fieldDecoders: readonly BasicFieldDecoder[];
	public constructor(
		private readonly shape: EncodedNodeShape,
		private readonly context: DecoderContext<EncodedChunkShape>,
	) {
		this.type = shape.type === undefined ? undefined : context.identifier(shape.type);

		const fieldDecoders: BasicFieldDecoder[] = [];
		for (const [fieldKey, fieldShape] of shape.fields ?? []) {
			const key: FieldKey = context.identifier(fieldKey);
			fieldDecoders.push(fieldDecoder(context, key, fieldShape));
		}
		this.fieldDecoders = fieldDecoders;
	}
	public decode(decoders: readonly ChunkDecoder[], stream: StreamCursor): TreeChunk {
		const type: TreeNodeSchemaIdentifier =
			this.type ?? readStreamIdentifier(stream, this.context);
		// TODO: Consider typechecking against stored schema in here somewhere.

		const value = readValue(stream, this.shape.value, this.context.idDecodingContext);
		const fields: Map<FieldKey, TreeChunk[]> = new Map();

		// Helper to add fields, but with unneeded array chunks removed.
		function addField(key: FieldKey, data: TreeChunk): void {
			// TODO: when handling of ArrayChunks has better performance (for example in cursors),
			// consider keeping array chunks here if they are longer than some threshold.
			const chunks = deaggregateChunks(data);

			if (chunks.length > 0) {
				fields.set(key, chunks);
			}
		}

		for (const decoder of this.fieldDecoders) {
			const [key, content] = decoder(decoders, stream);
			addField(key, content);
		}

		if (this.shape.extraFields !== undefined) {
			const decoder = decoders[this.shape.extraFields] ?? oob();
			const inner = readStreamStream(stream);
			while (inner.offset !== inner.data.length) {
				const key: FieldKey = readStreamIdentifier(inner, this.context);
				addField(key, decoder.decode(decoders, inner));
			}
		}

		return new BasicChunk(type, fields, value);
	}
}
