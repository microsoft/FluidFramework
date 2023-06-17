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

export class IdentifierToken {
	public constructor(public readonly identifier: string) {}
}

export type BufferFormat<TEncodedShape> = (TreeValue | Shape<TEncodedShape> | IdentifierToken)[];

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
