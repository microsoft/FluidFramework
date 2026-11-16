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
	TreeValue,
} from "../../../core/index.js";
import {
	assertNonNegativeSafeInteger,
	assertValidIndex,
	brand,
	decompressIdentifierIfNeeded,
	type IdDecodingContext,
} from "../../../util/index.js";
import { BasicChunk } from "../basicChunk.js";
import { defaultChunkPolicy } from "../chunkTree.js";
import { emptyChunk } from "../emptyChunk.js";
import { SequenceChunk } from "../sequenceChunk.js";
import { TreeShape, UniformChunk, type ChunkShape, type FieldShape } from "../uniformChunk.js";
import { assertAllowedValue } from "../../valueUtilities.js";

import {
	type ChunkDecoder,
	type StreamCursor,
	getChecked,
	getFullyChecked,
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
	type EncodedFieldBatchAnyVersion,
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
	chunk: EncodedFieldBatchAnyVersion,
	idDecodingContext: IdDecodingContext,
	incrementalDecoder?: IncrementalDecoder,
): TreeChunk[] {
	return genericDecode(
		decoderLibrary,
		new DecoderContext<EncodedChunkShape>(
			chunk.identifiers,
			chunk.shapes,
			idDecodingContext,
			incrementalDecoder,
		),
		chunk,
		new AnyDecoder(),
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
 * A prepared decoding operation for a fixed unit of encoded tree data.
 *
 * @remarks
 * {@link TreeShape} describes decoded structure and value positions, while this plan also describes how to read the encoded values.
 * A {@link UniformChunk} contains those values; this plan can produce them without constructing intermediate child chunks.
 *
 * One execution consumes {@link UniformDecodingPlan.encodedSize} stream items and produces values for
 * {@link UniformDecodingPlan.topLevelLength} top-level trees sharing {@link UniformDecodingPlan.treeShape}.
 * {@link decodeUniform} executes repeated units and constructs a single chunk from the resulting flat values array.
 *
 * When {@link UniformDecodingPlan.valuesAreVerbatim} is true, {@link decodeUniform} reads the values directly instead of calling
 * {@link UniformDecodingPlan.decodeValuesInto}.
 * Otherwise, that method appends converted values into a caller-provided buffer.
 *
 * Uniform decoding deliberately allows a chunk's total node count to exceed the uniform chunk size limit in {@link defaultChunkPolicy}
 * by repeating a supported tree shape.
 * The size of an individual tree shape remains bounded during plan construction.
 *
 * This favors efficient decoding and compact storage of content that may remain unchanged.
 * When the encoded representation permits, it also allows reuse of the complete values array.
 * Splitting is deferred until an edit requires it,
 * trading lower decoding costs and initial memory overhead for potentially higher first-edit costs and temporary allocations.
 */
interface UniformDecodingPlan {
	/**
	 * Shape shared by all top-level trees in this plan.
	 */
	readonly treeShape: TreeShape;
	/**
	 * Decompresses session-space identifiers retained in the decoded values.
	 */
	readonly idCompressor: IdDecodingContext["idCompressor"];
	/**
	 * Number of top-level trees produced by one execution of this plan.
	 */
	readonly topLevelLength: number;
	/**
	 * Number of stream items consumed by one execution of this plan.
	 */
	readonly encodedSize: number;
	/**
	 * Whether the encoded items already have the order and representation required by {@link UniformChunk.values}.
	 *
	 * @remarks
	 * This describes representation compatibility, not ownership of a particular array.
	 * {@link decodeUniform} can take ownership of a complete values array, including one read from a nested-array encoding,
	 * or copy the relevant portion of a larger stream.
	 * When false, it uses {@link UniformDecodingPlan.decodeValuesInto} to perform conversions such as identifier resolution.
	 */
	readonly valuesAreVerbatim: boolean;
	/**
	 * Decodes one unit of encoded data into a caller-provided flat values buffer without modifying this plan.
	 *
	 * @param stream - Encoded data to consume, advancing its offset by {@link UniformDecodingPlan.encodedSize}.
	 * @param values - Buffer to append decoded values to, preserving existing entries.
	 * Values follow the order required by {@link UniformDecodingPlan.treeShape}, repeated {@link UniformDecodingPlan.topLevelLength} times.
	 *
	 * @remarks
	 * Resolves encoded identifiers to session-space identifiers or strings.
	 * Child plans append into the same buffer, which {@link decodeUniform} passes to {@link UniformChunk} after all repetitions.
	 * The verbatim path described by {@link UniformDecodingPlan.valuesAreVerbatim} bypasses this method.
	 */
	decodeValuesInto(stream: StreamCursor, values: TreeValue[]): void;
}

/**
 * Shared shapes for built-in leaves, independent of decoding context.
 * @remarks
 * Matches `SchemaFactory.leaves`, which cannot be imported here due to layering.
 * String shapes support compressed identifiers to match the schema-derived shapes used for local content.
 * Exported for testing.
 * This exists to help optimize decoding of leaves.
 */
export const builtInLeafChunkShapes: ReadonlyMap<TreeNodeSchemaIdentifier, ChunkShape> =
	new Map(
		["number", "string", "boolean", "null", "handle"].map((name) => {
			const type = brand<TreeNodeSchemaIdentifier>(`com.fluidframework.leaf.${name}`);
			return [type, new TreeShape(type, true, [], name === "string").withTopLevelLength(1)];
		}),
	);

/**
 * Caches a {@link UniformDecodingPlan} independently of decoder initialization order.
 * A dependency encountered during its own analysis uses the general decoding path.
 */
abstract class UniformShapeDecoder implements ChunkDecoder {
	/**
	 * Whether plan analysis has started, preventing recursive analysis from following cycles.
	 */
	private planResolved = false;
	/**
	 * Cached plan, or `undefined` while analysis is in progress or when no uniform plan is supported.
	 */
	private plan?: UniformDecodingPlan;

	/**
	 * Returns the cached {@link UniformDecodingPlan}, computing it on first use.
	 * Recursive requests made during analysis return `undefined` to select general decoding.
	 *
	 * @param decoders - Peer decoders for this batch, which might not have been initialized yet.
	 */
	public getUniformDecodingPlan(
		decoders: readonly ChunkDecoder[],
	): UniformDecodingPlan | undefined {
		if (!this.planResolved) {
			this.planResolved = true;
			this.plan = this.buildUniformDecodingPlan(decoders);
		}
		return this.plan;
	}

	/**
	 * Computes a {@link UniformDecodingPlan}, or returns `undefined` when the shape requires general decoding.
	 *
	 * @param decoders - Peer decoders for this batch, which might not have been initialized yet.
	 * Use {@link UniformShapeDecoder.getUniformDecodingPlan} for cycle-safe dependency analysis.
	 */
	protected abstract buildUniformDecodingPlan(
		decoders: readonly ChunkDecoder[],
	): UniformDecodingPlan | undefined;
	public abstract initialize(decoders: readonly ChunkDecoder[]): void;
	public abstract decode(stream: StreamCursor): TreeChunk;
}

/**
 * Requests a decoder's {@link UniformDecodingPlan}, or returns `undefined` if it does not support uniform decoding.
 *
 * @param decoders - Peer decoders for this batch, which might not have been initialized yet.
 */
function getUniformDecodingPlan(
	decoder: ChunkDecoder,
	decoders: readonly ChunkDecoder[],
): UniformDecodingPlan | undefined {
	return decoder instanceof UniformShapeDecoder
		? decoder.getUniformDecodingPlan(decoders)
		: undefined;
}

/**
 * Executes a {@link UniformDecodingPlan} repeatedly and constructs one uniform chunk without intermediate child chunks.
 *
 * @param repetitions - Number of plan executions; zero produces {@link emptyChunk}.
 * @param stream - Encoded data to consume, advancing its offset past all decoded units.
 *
 * @remarks
 * When {@link UniformDecodingPlan.valuesAreVerbatim} is true, validates and takes ownership of the data array if the decoded units
 * cover the complete array, or copies their values into a new array when decoding only part of the stream.
 * In particular, {@link NestedArrayDecoder} provides a cursor over its nested values array, allowing that array to be reused directly.
 * Otherwise, calls {@link UniformDecodingPlan.decodeValuesInto} for each unit to populate a new flat values array.
 * The plan itself is not modified.
 *
 * The resulting chunk can exceed the uniform chunk size limit in {@link defaultChunkPolicy}.
 * See {@link UniformDecodingPlan} for the size-policy rationale and editing tradeoffs.
 */
function decodeUniform(
	plan: UniformDecodingPlan,
	repetitions: number,
	stream: StreamCursor,
): TreeChunk {
	const length = plan.topLevelLength * repetitions;
	assertNonNegativeSafeInteger(length);
	if (length === 0) {
		return emptyChunk;
	}
	let values: TreeValue[];
	const encodedSize = plan.encodedSize * repetitions;
	assertNonNegativeSafeInteger(encodedSize);
	assert(encodedSize <= stream.data.length - stream.offset, "incomplete uniform chunk data");
	if (
		plan.valuesAreVerbatim &&
		stream.offset === 0 &&
		encodedSize === stream.data.length &&
		Array.isArray(stream.data)
	) {
		for (const value of stream.data) {
			assertAllowedValue(value);
		}
		values = stream.data as TreeValue[];
		stream.offset = stream.data.length;
	} else {
		values = [];
		if (plan.valuesAreVerbatim) {
			const endOffset = stream.offset + encodedSize;
			while (stream.offset < endOffset) {
				values.push(readStreamValue(stream));
			}
		} else {
			for (let index = 0; index < repetitions; index++) {
				plan.decodeValuesInto(stream, values);
			}
		}
	}
	return new UniformChunk(
		plan.treeShape.withTopLevelLength(length),
		values,
		plan.idCompressor,
	);
}

/**
 * Decoder for {@link EncodedSpecializedNodeShape}s.
 * Applies the specialization's field overrides to the resolved base node shape, then delegates
 * to a {@link NodeDecoder} built from the resulting shape.
 */
export class SpecializedNodeDecoder extends UniformShapeDecoder {
	private readonly inner: NodeDecoder;
	public constructor(
		shape: EncodedSpecializedNodeShape,
		context: DecoderContext<EncodedChunkShape>,
	) {
		super();
		this.inner = new NodeDecoder(normalizeToNodeShape(shape, context), context);
	}
	protected buildUniformDecodingPlan(
		decoders: readonly ChunkDecoder[],
	): UniformDecodingPlan | undefined {
		return this.inner.getUniformDecodingPlan(decoders);
	}
	public initialize(decoders: readonly ChunkDecoder[]): void {
		this.inner.initialize(decoders);
	}
	public decode(stream: StreamCursor): TreeChunk {
		return this.inner.decode(stream);
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
		return new AnyDecoder();
	},
	e(
		shape: EncodedIncrementalChunkShape,
		context: DecoderContext<EncodedChunkShape>,
	): ChunkDecoder {
		return new IncrementalChunkDecoder(context);
	},
	f(
		shape: EncodedSpecializedNodeShape,
		context: DecoderContext<EncodedChunkShape>,
	): ChunkDecoder {
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
			return decompressIdentifierIfNeeded(
				readIdentifierValue(stream, idDecodingContext),
				idDecodingContext.idCompressor,
			);
		} else {
			// EncodedCounter case:
			unreachableCase(shape, "decoding values as deltas is not yet supported");
		}
	}
}

/**
 * Reads an identifier value, preserving strings and resolving compressed identifiers to session space.
 * Resolution and healing use {@link IdDecodingContext.resolveEncodedId}.
 */
function readIdentifierValue(
	stream: StreamCursor,
	idDecodingContext: IdDecodingContext,
): SessionSpaceCompressedId | string {
	const value = readStream(stream);
	assert(
		typeof value === "number" || typeof value === "string",
		"identifier must be string or number",
	);
	return typeof value === "string"
		? value
		: idDecodingContext.resolveEncodedId(value as OpSpaceCompressedId);
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
	/**
	 * Element decoder linked during initialization and used by general decoding.
	 */
	private decoder!: ChunkDecoder;

	public constructor(private readonly shape: EncodedNestedArrayShape) {}

	/**
	 * Decoding strategy selected by {@link NestedArrayDecoder.initialize} and called after {@link NestedArrayDecoder.decode} validates the input framing.
	 * @remarks
	 * A number specifies a positive repetition count for elements that consume no encoded data (see {@link EncodedNestedArrayShape}); an array contains the encoded element data.
	 */
	private decodeArray!: (data: number | StreamCursor["data"]) => TreeChunk;

	public decode(stream: StreamCursor): TreeChunk {
		const data = readStream(stream);
		if (typeof data === "number") {
			assertNonNegativeSafeInteger(data);
			if (data === 0) {
				return emptyChunk;
			}
		} else {
			assert(Array.isArray(data), "expected nested array data");
		}
		return this.decodeArray(data);
	}

	public initialize(decoders: readonly ChunkDecoder[]): void {
		this.decoder = getFullyChecked(decoders, this.shape);
		const plan = getUniformDecodingPlan(this.decoder, decoders);
		this.decodeArray =
			plan === undefined
				? this.decodeGeneral.bind(this)
				: (data) => {
						if (typeof data === "number") {
							assert(plan.encodedSize === 0, "expected data for nonempty uniform encoding");
							return decodeUniform(plan, data, { data: [], offset: 0 });
						}
						if (data.length === 0) {
							return emptyChunk;
						}
						assert(
							plan.encodedSize > 0 && data.length % plan.encodedSize === 0,
							"incomplete uniform chunk data",
						);
						return decodeUniform(plan, data.length / plan.encodedSize, {
							data,
							offset: 0,
						});
					};
	}

	/**
	 * Decodes elements individually when their shape has no uniform plan.
	 * @remarks
	 * This can handle all cases, and is used as a fallback when no faster option is available.
	 */
	private decodeGeneral(data: number | StreamCursor["data"]): TreeChunk {
		const decoder = this.decoder;

		const chunks: TreeChunk[] = [];

		if (typeof data === "number") {
			// This case means that the array contained only 0-sized items, and was thus encoded as the length of the array.
			const inner = { data: [], offset: 0 };
			for (let index = 0; index < data; index++) {
				chunks.push(decoder.decode(inner));
			}
		} else {
			const inner = { data, offset: 0 };
			while (inner.offset !== inner.data.length) {
				const previousOffset = inner.offset;
				chunks.push(decoder.decode(inner));
				assert(inner.offset > previousOffset, "nested array decoder must consume data");
			}
		}

		return aggregateChunks(chunks);
	}
}

/**
 * Decoder for {@link EncodedInlineArrayShape}s.
 */
export class InlineArrayDecoder extends UniformShapeDecoder {
	/**
	 * Element decoder linked during initialization and used by general decoding.
	 */
	private decoder!: ChunkDecoder;
	public constructor(private readonly shape: EncodedInlineArrayShape) {
		super();
	}
	public decode!: (stream: StreamCursor) => TreeChunk;
	protected buildUniformDecodingPlan(
		decoders: readonly ChunkDecoder[],
	): UniformDecodingPlan | undefined {
		const plan = getUniformDecodingPlan(getFullyChecked(decoders, this.shape.shape), decoders);
		if (plan === undefined) {
			return undefined;
		}
		const length = this.shape.length;
		const topLevelLength = plan.topLevelLength * length;
		const encodedSize = plan.encodedSize * length;
		assertNonNegativeSafeInteger(length);
		assertNonNegativeSafeInteger(topLevelLength);
		assertNonNegativeSafeInteger(encodedSize);
		return {
			treeShape: plan.treeShape,
			idCompressor: plan.idCompressor,
			topLevelLength,
			encodedSize,
			valuesAreVerbatim: plan.valuesAreVerbatim,
			decodeValuesInto(stream, values): void {
				for (let index = 0; index < length; index++) {
					plan.decodeValuesInto(stream, values);
				}
			},
		};
	}
	public initialize(decoders: readonly ChunkDecoder[]): void {
		this.decoder = getFullyChecked(decoders, this.shape.shape);
		const plan = this.getUniformDecodingPlan(decoders);
		this.decode =
			plan === undefined
				? this.decodeGeneral.bind(this)
				: (stream) => decodeUniform(plan, 1, stream);
	}
	/**
	 * Decodes the fixed number of elements individually when their shape has no uniform plan.
	 */
	private decodeGeneral(stream: StreamCursor): TreeChunk {
		const length = this.shape.length;
		const decoder = this.decoder;
		const chunks: TreeChunk[] = [];
		for (let index = 0; index < length; index++) {
			chunks.push(decoder.decode(stream));
		}
		return aggregateChunks(chunks);
	}
}

/**
 * Decoder for {@link EncodedIncrementalChunkShape}s.
 */
export class IncrementalChunkDecoder implements ChunkDecoder {
	public constructor(private readonly context: DecoderContext<EncodedChunkShape>) {}
	public initialize(_decoders: readonly ChunkDecoder[]): void {}
	public decode(stream: StreamCursor): TreeChunk {
		assert(
			this.context.incrementalDecoder !== undefined,
			0xc27 /* incremental decoder not available for incremental field decoding */,
		);

		const chunkDecoder = (batch: EncodedFieldBatchAnyVersion): TreeChunk => {
			assert(
				supportsIncrementalEncoding(batch.version),
				0xc9f /* Unsupported FieldBatchFormatVersion for incremental chunks; must be v2 or higher */,
			);
			const context = new DecoderContext<EncodedChunkShape>(
				batch.identifiers,
				batch.shapes,
				this.context.idDecodingContext,
				this.context.incrementalDecoder,
			);
			const chunks = genericDecode(decoderLibrary, context, batch, new AnyDecoder());
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
export class AnyDecoder implements ChunkDecoder {
	/**
	 * Batch-local decoder table indexed by shape indices read from the stream.
	 */
	private decoders!: readonly ChunkDecoder[];
	public initialize(decoders: readonly ChunkDecoder[]): void {
		this.decoders = decoders;
	}
	public decode(stream: StreamCursor): TreeChunk {
		const shapeIndex = readStreamNumber(stream);
		const decoder = getFullyChecked(this.decoders, shapeIndex);
		return decoder.decode(stream);
	}
}

/**
 * Decoder for field.
 */
type BasicFieldDecoder = (stream: StreamCursor) => [FieldKey, TreeChunk];

/**
 * Get a decoder for fields of a provided (via `shape` and `context`).
 */
function fieldDecoder(
	decoders: readonly ChunkDecoder[],
	key: FieldKey,
	shape: number,
): BasicFieldDecoder {
	// NodeDecoder's constructor validates fixed-field shape indices.
	const decoder = getChecked(decoders, shape);
	return (stream) => {
		return [key, decoder.decode(stream)];
	};
}

/**
 * Decoder for {@link EncodedNodeShape}s.
 */
export class NodeDecoder extends UniformShapeDecoder {
	private readonly type?: TreeNodeSchemaIdentifier;
	/**
	 * Cached shape for the direct, single-value leaf decoding strategy, when applicable.
	 */
	private readonly leafShape?: ChunkShape;
	/**
	 * Decoders for fixed fields, linked during initialization for the general node decoding strategy.
	 */
	private fieldDecoders!: readonly BasicFieldDecoder[];
	/**
	 * Decoder for fields whose keys are supplied by the stream, when the encoded shape allows them.
	 */
	private extraFieldsDecoder?: ChunkDecoder;
	public constructor(
		private readonly shape: EncodedNodeShape,
		private readonly context: DecoderContext<EncodedChunkShape>,
	) {
		super();
		this.type = shape.type === undefined ? undefined : context.identifier(shape.type);
		for (const [, fieldShape] of shape.fields ?? []) {
			assertValidIndex(fieldShape, context.shapes);
		}
		if (
			this.type !== undefined &&
			shape.value === true &&
			(shape.fields?.length ?? 0) === 0 &&
			shape.extraFields === undefined
		) {
			const chunkShape =
				builtInLeafChunkShapes.get(this.type) ??
				new TreeShape(this.type, true, []).withTopLevelLength(1);
			this.leafShape = chunkShape;
			this.decode = (stream): TreeChunk => {
				const value = readStreamValue(stream);
				return new UniformChunk(chunkShape, [value], context.idDecodingContext.idCompressor);
			};
		}
	}

	protected buildUniformDecodingPlan(
		decoders: readonly ChunkDecoder[],
	): UniformDecodingPlan | undefined {
		if (this.type === undefined || this.shape.extraFields !== undefined) {
			return undefined;
		}
		const valueShape = this.shape.value;
		const compressedIdentifier = valueShape === SpecialField.Identifier;
		if (
			valueShape !== true &&
			valueShape !== false &&
			!(compressedIdentifier && this.type === "com.fluidframework.leaf.string")
		) {
			return undefined;
		}
		const hasValue = valueShape !== false;
		const fields: FieldShape[] = [];
		const plans: UniformDecodingPlan[] = [];
		const keys = new Set<FieldKey>();
		let nodeCount = 1;
		let encodedSize = hasValue ? 1 : 0;
		let valuesAreVerbatim = !compressedIdentifier;
		for (const [encodedKey, fieldShape] of this.shape.fields ?? []) {
			const key: FieldKey = this.context.identifier(encodedKey);
			if (keys.has(key)) {
				return undefined;
			}
			keys.add(key);
			// The constructor validates fixed-field shape indices.
			const plan = getUniformDecodingPlan(getChecked(decoders, fieldShape), decoders);
			if (plan === undefined) {
				return undefined;
			}
			if (plan.topLevelLength > 0) {
				if (hasValue) {
					return undefined;
				}
				nodeCount += plan.treeShape.positions.length * plan.topLevelLength;
				// Bound individual shape metadata, not repetitions of that shape in a chunk.
				// See UniformDecodingPlan for the size-policy rationale.
				if (nodeCount > defaultChunkPolicy.uniformChunkNodeCount) {
					return undefined;
				}
				fields.push([key, plan.treeShape, plan.topLevelLength]);
			}
			plans.push(plan);
			encodedSize += plan.encodedSize;
			valuesAreVerbatim &&= plan.valuesAreVerbatim;
		}
		const context = this.context.idDecodingContext;
		return {
			treeShape:
				this.leafShape?.treeShape ??
				new TreeShape(this.type, hasValue, fields, compressedIdentifier),
			idCompressor: context.idCompressor,
			topLevelLength: 1,
			encodedSize,
			valuesAreVerbatim,
			decodeValuesInto(stream, values): void {
				if (compressedIdentifier) {
					values.push(readIdentifierValue(stream, context));
				} else if (hasValue) {
					values.push(readStreamValue(stream));
				}
				for (const plan of plans) {
					plan.decodeValuesInto(stream, values);
				}
			},
		};
	}

	public initialize(decoders: readonly ChunkDecoder[]): void {
		if (this.leafShape !== undefined) {
			return;
		}
		const fieldDecoders: BasicFieldDecoder[] = [];
		for (const [fieldKey, fieldShape] of this.shape.fields ?? []) {
			const key: FieldKey = this.context.identifier(fieldKey);
			fieldDecoders.push(fieldDecoder(decoders, key, fieldShape));
		}
		this.fieldDecoders = fieldDecoders;
		this.extraFieldsDecoder =
			this.shape.extraFields === undefined
				? undefined
				: getFullyChecked(decoders, this.shape.extraFields);
	}
	public decode(stream: StreamCursor): TreeChunk {
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
			const [key, content] = decoder(stream);
			addField(key, content);
		}

		if (this.extraFieldsDecoder !== undefined) {
			const decoder = this.extraFieldsDecoder;
			const inner = readStreamStream(stream);
			while (inner.offset !== inner.data.length) {
				const key: FieldKey = readStreamIdentifier(inner, this.context);
				addField(key, decoder.decode(inner));
			}
		}

		return new BasicChunk(type, fields, value);
	}
}
