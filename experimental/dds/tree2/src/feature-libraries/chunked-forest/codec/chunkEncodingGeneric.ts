/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeValue } from "../../../core";
import { fail } from "../../../util";
import { EncodedChunkGeneric } from "./formatGeneric";
import {
	Counter,
	CounterFilter,
	DeduplicationTable,
	jsonMinimizingFilter,
} from "./chunkCodecUtilities";

/**
 * An identifier which can be compressed using {@link Counter}.
 *
 * @remarks
 * Compression of Identifiers is done after the output is otherwise generated to enable counting all the usages.
 * To avoid having to decode the decode the data array to determine which data is an identifier and which is some other string,
 * some recognizable representing is required.
 * Using a class and checking its prototype works for this, and is why IdentifierToken is a class.
 */
export class IdentifierToken {
	public constructor(public readonly identifier: string) {}
}

/**
 * Format for data emitted during encoding, before dictionary compression of identifiers.
 *
 * @remarks
 * These buffers are mutated after construction if they contain identifiers or shapes.
 */
export type BufferFormat<TEncodedShape> = (
	| TreeValue
	| Shape<TEncodedShape>
	| IdentifierToken
	| BufferFormat<TEncodedShape>[]
)[];

/**
 * Replace shapes and identifiers in buffer and any nested arrays.
 *
 * This looks inside nested arrays (including transitively) but not inside objects.
 *
 * Note that this modifies `buffer` to avoid having to copy it.
 */
export function handleShapesAndIdentifiers<TEncodedShape>(
	version: string,
	buffer: BufferFormat<TEncodedShape>,
	identifierFilter: CounterFilter<string> = jsonMinimizingFilter,
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

	const arrays: BufferFormat<TEncodedShape>[] = [buffer];
	for (const array of arrays) {
		for (const item of array) {
			if (item instanceof IdentifierToken) {
				identifiers.add(item.identifier);
			} else if (item instanceof Shape) {
				shapeDiscovered(item);
			} else if (Array.isArray(item)) {
				// In JS it is legal to push items to an array which is being iterated,
				// and they will be visited in order.
				arrays.push(item);
			} else if (typeof item === "object" && (item as any).shape instanceof Shape) {
				// because "serializable" is allowed in buffer and it has type `any`, its very easy to mess up including of shapes in the buffer.
				// This catches the easiest way to get it wrong.
				fail("encoder interface instead of shape written to stream");
			}
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
	const identifierTable = identifiers.buildTable(identifierFilter);
	const shapeTable = shapes.buildTable();

	for (const array of arrays) {
		for (let index = 0; index < array.length; index++) {
			const item = array[index];
			if (item instanceof IdentifierToken) {
				array[index] = identifierTable.valueToIndex.get(item.identifier) ?? item.identifier;
			} else if (item instanceof Shape) {
				array[index] = shapeTable.valueToIndex.get(item) ?? fail("missing shape");
			}
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

/**
 * A tree shape which can have references to it deduplicated using {@link Counter}.
 *
 * @remarks
 * Deduplication of shapes is done after the output is otherwise generated (including identifier dictionary encoding).
 * To avoid having to decode the decode the data array to determine which data is a shape and which is some other object,
 * some recognizable representing is required.
 * Using a class and checking its prototype works for this, and is why Shape is a class.
 *
 * Note that deduplication compares shapes by object identity not by content, so encoders must ensure shapes are not duplicated to achieve efficient encoding.
 */
export abstract class Shape<TEncodedShape> {
	/**
	 * Count this shape's contents.
	 *
	 * Used to discover referenced shapes (which need to be included),
	 * as well as count usages of shapes and identifiers for more efficient dictionary encoding. See {@link Counter}.
	 */
	public abstract count(
		identifiers: Counter<string>,
		shapes: (shape: Shape<TEncodedShape>) => void,
	): void;

	/**
	 * Produce the final encoded format for this shape.
	 *
	 * @param identifiers - a subset of identifiers used in this tree, and their corresponding indexes to use for the dictionary encoding.
	 * Can be used to encode identifiers referenced by this shape.
	 * @param shapes - includes a superset of shapes reported by count.
	 * Used to encode references to shapes as numbers.
	 */
	public abstract encodeShape(
		identifiers: DeduplicationTable<string>,
		shapes: DeduplicationTable<Shape<TEncodedShape>>,
	): TEncodedShape;
}
