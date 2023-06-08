/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Brand, BrandedKey, BrandedMapSubset, BrandedType, brandedSlot, fail } from "../../../util";
import { TreeValue } from "../../../core";
import { TreeChunk } from "../chunk";
import { emptyChunk } from "../emptyChunk";
import { EncodedChunkGeneric } from "./formatGeneric";
import {
	ChunkDecoder,
	Counter,
	DeduplicationTable,
	DiscriminatedUnionDispatcher,
	generalDecoder,
	getChecked,
	jsonMinimizingFilter,
} from "./chunkEncodingUtilities";

/**
 * Chunk encoding and decoding system.
 *
 * Does not include parts that are specific to particular chunk types.
 *
 * TODO: maybe unify some of this with utilities
 */

/**
 * For contravariant type parameters a default of `never` means all possible values.
 */
type ContravariantUnknown = never;

export class IdentifierToken {
	public constructor(public readonly identifier: string) {}
}

export type BufferFormat<TEncodedShape> = (TreeValue | Shape<TEncodedShape> | IdentifierToken)[];

/**
 * Chunk encoder using the format
 * shape, [data for shape].
 *
 * All sub-encoders should follow this.
 *
 * Used in locations not optimized by context (currently at the root and in arrays).
 *
 * Encodes the data in terms of TreeValues, shapes and identifier references.
 * This produces the data for the top level "data" field, and determines what shapes and identifiers are used, but does not actually do the final shape or identifier encoding.
 */
export interface GeneralChunkEncoder<
	TEncodedShape,
	TChunk extends TreeChunk = ContravariantUnknown,
> {
	encode(chunk: TChunk, shapes: EncoderCache, outputBuffer: BufferFormat<TEncodedShape>): void;
}

export interface NamedChunkEncoder<TEncodedShape, TChunk extends TreeChunk = ContravariantUnknown>
	extends GeneralChunkEncoder<TEncodedShape, TChunk> {
	readonly type: new (...args: ContravariantUnknown) => TChunk;
}

export class ChunkEncoderLibrary<TEncodedShape> implements GeneralChunkEncoder<TreeChunk> {
	// Map from prototype to encoder
	private readonly map: Map<unknown, GeneralChunkEncoder<TEncodedShape>> = new Map();
	public constructor(...encoders: readonly NamedChunkEncoder<TEncodedShape, any>[]) {
		for (const encoder of encoders) {
			this.map.set(encoder.type.prototype, encoder);
		}
	}

	public encode(
		chunk: TreeChunk,
		shapes: EncoderCache,
		outputBuffer: BufferFormat<TEncodedShape>,
	): void {
		assert(chunk !== emptyChunk, "empty chunks not allowed aside from root");
		const type = Object.getPrototypeOf(chunk);
		const encoder = this.map.get(type) ?? fail("cannot encode chunk with unexpected prototype");
		encoder.encode(chunk as ContravariantUnknown, shapes, outputBuffer);
	}
}

/**
 * Encode
 */
export function encode<TEncodedShape>(
	version: string,
	encoderLibrary: GeneralChunkEncoder<TEncodedShape, TreeChunk>,
	shapeManager: EncoderCache,
	chunk: TreeChunk,
): EncodedChunkGeneric<TEncodedShape> {
	if (chunk === emptyChunk) {
		return { version, identifiers: [], shapes: [], data: [] };
	}

	const buffer: BufferFormat<TEncodedShape> = [];
	// Populate buffer, including shape and identifier references
	encoderLibrary.encode(chunk, shapeManager, buffer);

	return handleShapesAndIdentifiers(version, buffer);
}

export function decode<TEncodedShape extends object>(
	decoderLibrary: DiscriminatedUnionDispatcher<
		TEncodedShape,
		[cache: DecoderCache<TEncodedShape>],
		ChunkDecoder
	>,
	chunk: EncodedChunkGeneric<TEncodedShape>,
): TreeChunk {
	if (chunk.data.length === 0) {
		assert(chunk.identifiers.length === 0, "chunk without shapes should be empty.");
		assert(chunk.shapes.length === 0, "chunk without shapes should be empty.");
		return emptyChunk;
	}

	const cache: DecoderCache<TEncodedShape> = new DecoderCache(chunk.identifiers, chunk.shapes);
	const decoders = chunk.shapes.map((shape) => decoderLibrary.dispatch(shape, cache));
	const stream = { data: chunk.data, offset: 0 };
	const result = generalDecoder(decoders, stream);
	assert(stream.offset === stream.data.length, "expected decode to consume full stream");
	return result;
}

/**
 * Replace shapes and identifiers in buffer.
 *
 * Note that this modifies `buffer` to avoid having to copy it.
 */
export function handleShapesAndIdentifiers<TEncodedShape>(
	version: string,
	buffer: BufferFormat<TEncodedShape>,
): EncodedChunkGeneric<TEncodedShape> {
	const identifiers = new Counter<string>();
	const shapes = new Counter<Shape<TEncodedShape>>();
	// Shapes can reference other shapes (and identifiers), so we need to traverse the shape graph.
	// These collections enable that.
	const shapesSeen = new Set<Shape<TEncodedShape>>();
	const shapeToCount: Shape<TEncodedShape>[] = [];
	const shapeDiscovered = (shape: Shape<TEncodedShape>) => {
		shapes.add(shape);
		if (!shapesSeen.has(shape)) {
			shapesSeen.add(shape);
			shapeToCount.push(shape);
		}
	};

	for (const item of buffer) {
		if (item instanceof IdentifierToken) {
			identifiers.add(item.identifier);
		} else if (item instanceof Shape) {
			shapeDiscovered(item);
		}
	}

	// Traverse shape graph, discovering and counting all shape to shape and shape to identifier references.
	{
		let item: Shape<TEncodedShape> | undefined;
		while ((item = shapeToCount.pop()) !== undefined) {
			item.count(identifiers, shapeDiscovered);
		}
	}

	// Determine substitutions for identifiers and shapes:
	const identifierTable = identifiers.buildTable(jsonMinimizingFilter);
	const shapeTable = shapes.buildTable();

	for (let index = 0; index < buffer.length; index++) {
		const item = buffer[index];
		if (item instanceof IdentifierToken) {
			buffer[index] = identifierTable.valueToIndex.get(item.identifier) ?? item.identifier;
		} else if (item instanceof Shape) {
			buffer[index] = shapeTable.valueToIndex.get(item) ?? fail("missing shape");
		}
	}

	const encodedShapes = shapeTable.indexToValue.map((shape) =>
		shape.encodeShape(identifierTable, shapeTable),
	);

	return {
		version,
		// TODO: fix readonly typing issues to remove this cast.
		identifiers: identifierTable.indexToValue as string[],
		shapes: encodedShapes,
		data: buffer as TreeValue[],
	};
}

export abstract class Shape<TEncodedShape> {
	/**
	 * Count this shape's contents.
	 */
	public abstract count(
		identifiers: Counter<string>,
		shapes: (shape: Shape<TEncodedShape>) => void,
	): void;

	public abstract encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape<TEncodedShape>>,
	): TEncodedShape;
}

export type EncoderCacheKeyBrand = Brand<number, "EncoderCacheSlot">;

export type EncoderCache = BrandedMapSubset<BrandedKey<EncoderCacheKeyBrand, any>>;

export function encoderCacheSlot<TContent>(): BrandedKey<EncoderCacheKeyBrand, TContent> {
	return brandedSlot<EncoderCacheKeyBrand, TContent>();
}

export type DecoderCacheKeyBrand = Brand<number, "DecoderCacheSlot">;

export type DecoderCacheSlots = BrandedMapSubset<BrandedKey<DecoderCacheKeyBrand, any>>;

export function decoderCacheSlot<TContent>(): BrandedKey<DecoderCacheKeyBrand, TContent> {
	return brandedSlot<DecoderCacheKeyBrand, TContent>();
}

/**
 * Caches shared data for use in constructing decoders.
 */
export class DecoderCache<TEncodedShape> {
	public readonly slots: DecoderCacheSlots = new Map();

	/**
	 * @param identifiers - identifier substitution table (use to replace numeric identifier indexes with the actual identifiers from this table).
	 *
	 * Unlike the other data stored in this object, identifiers and shapes are not really a cache since the decoders don't any any other way to access this information.
	 */
	public constructor(
		public readonly identifiers: readonly string[],
		public readonly shapes: readonly TEncodedShape[],
	) {}

	public identifier<T extends string & BrandedType<string, string>>(encoded: string | number): T {
		if (typeof encoded === "string") {
			return encoded as T;
		}
		return getChecked(this.identifiers, encoded) as T;
	}
}
