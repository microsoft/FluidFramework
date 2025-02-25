/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeValue } from "../../../core/index.js";
import { fail } from "../../../util/index.js";
import type { FluidSerializableReadOnly } from "../../valueUtilities.js";

import {
	Counter,
	type CounterFilter,
	type DeduplicationTable,
	jsonMinimizingFilter,
} from "./chunkCodecUtilities.js";
import type { EncodedFieldBatchGeneric } from "./formatGeneric.js";

/**
 * An identifier which can be compressed using {@link Counter}.
 *
 * @remarks
 * Compression of Identifiers is done after the output is otherwise generated to enable counting all the usages.
 * To avoid having to decode the decode the data array to determine which data is an identifier and which is some other string,
 * some recognizable representation is required.
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
	| FluidSerializableReadOnly
	| Shape<TEncodedShape>
	| IdentifierToken
	| BufferFormat<TEncodedShape>
)[];

/**
 * Replace shapes and identifiers in buffer and any nested arrays.
 *
 * This looks inside nested arrays (including transitively) but not inside objects.
 *
 * Note that this modifies `buffer` to avoid having to copy it.
 */
export function handleShapesAndIdentifiers<TEncodedShape>(
	version: number,
	buffer: BufferFormat<TEncodedShape>[],
	identifierFilter: CounterFilter<string> = jsonMinimizingFilter,
): EncodedFieldBatchGeneric<TEncodedShape> {
	const identifiers = new Counter<string>();
	const shapes = new Counter<Shape<TEncodedShape>>();
	// Shapes can reference other shapes (and identifiers), so we need to traverse the shape graph.
	// These collections enable that.
	const shapesSeen = new Set<Shape<TEncodedShape>>();
	const shapeToCount: Shape<TEncodedShape>[] = [];
	const shapeDiscovered = (shape: Shape<TEncodedShape>): void => {
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
			} else if (
				item !== null &&
				typeof item === "object" &&
				(item as Record<string, unknown>).shape instanceof Shape
			) {
				// because "serializable" is allowed in buffer and it has type `any`, its very easy to mess up including of shapes in the buffer.
				// This catches the easiest way to get it wrong.
				fail(0xb4b /* encoder interface instead of shape written to stream */);
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
				array[index] = shapeTable.valueToIndex.get(item) ?? fail(0xb4c /* missing shape */);
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
		data: buffer as TreeValue[][],
	};
}

/**
 * A tree shape.
 * This similar to a schema for a tree, though it may be more or less specific than the actual schema system used.
 * Can be encoded into a `TEncodedShape`: when doing so encodes references to shapes (if needed) using {@link Counter}:
 * this can include recursive references (direct or indirect).
 *
 * @remarks
 * Deduplication of shapes is done after the output is otherwise generated (including identifier dictionary encoding).
 * To avoid having to decode the data array to determine which data is a shape and which is some other object,
 * some recognizable representation is required.
 * Using a class and checking its prototype works for this, and is why Shape is a class.
 *
 * Note that deduplication compares shapes by object identity not by content, so encoders must ensure shapes are not duplicated to achieve efficient encoding.
 * Comparison by content would be difficult due to shape containing references to other shapes.
 *
 * @privateRemarks
 * Unlike with identifiers, conversion from the initial form (this class / IdentifierToken) is done by the `encodeShape` method, not by general purpose logic in `handleShapesAndIdentifiers`.
 * For `handleShapesAndIdentifiers` to do the conversion without help from `encodeShape`,
 * instances of this Shape class would have to either be or output an object that is identical to the `TEncodedShape` format except with all shape references as object references instead of indexes.
 * Those objects would have to be deeply traversed looking for shape objects to replace with reference indexes.
 * This is possible, but making it type safe would involve generating derived types from the `TEncodedShape` deeply replacing any shape references, as well as requiring deep traversal of all objects in the encoded output.
 * Such an approach seemed less maintainable and readable than the design taken here which avoids the need for those derived types.
 */
export abstract class Shape<TEncodedShape> {
	/**
	 * Count this shape's contents.
	 *
	 * Used to discover referenced shapes (to ensure they are included in the `shapes` passed to `encodeShape`),
	 * as well as count usages of shapes and identifiers for more efficient dictionary encoding. See {@link Counter}.
	 *
	 * @param shapes - must be invoked with each directly referenced shape (which must provided to `encodeShape`).
	 * Can be invoked multiple times if a shape is referenced more than once for more efficient dictionary encoding.
	 * Should not be invoked with `this` unless this shape references itself.
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
