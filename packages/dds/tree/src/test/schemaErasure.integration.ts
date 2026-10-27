/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory, Tree, TreeViewConfiguration } from "@fluidframework/tree";
import {
	eraseSchemaDetails,
	independentView,
	type ErasedNode,
	type ErasedSchema,
} from "@fluidframework/tree/alpha";

// #region Library public API: these are the declarations consumers import

/** Domain operations and observable state, without the stored sideLength field. */
export interface SquareMembers {
	readonly area: number;
	resize(sideLength: number): void;
}

/** Retain node identity and the exact persisted identifier at the public boundary. */
export type Square = ErasedNode<SquareMembers, "com.example.geometry.Square">;

/** Construction uses domain terms rather than exposing the stored object shape. */
export interface SquareStatics {
	create(sideLength: number): Square;
}

// #endregion

// #region Library implementation: callers do not import this class

const factory = new SchemaFactory("com.example.geometry");

class SquareImplementation
	extends factory.object("Square", { sideLength: factory.number })
	implements SquareMembers
{
	public get area(): number {
		return this.sideLength * this.sideLength;
	}

	public resize(sideLength: number): void {
		this.sideLength = sideLength;
	}

	public static create(sideLength: number): SquareImplementation {
		return new SquareImplementation({ sideLength });
	}
}

/**
 * The exported value supports composition and construction without exposing SquareImplementation.
 * Erasure changes the TypeScript surface, not the runtime schema or stored representation.
 * See configurableSchemaLibrary.integration.ts for a factory with a similar explicit public boundary.
 * See simple-tree/api/eraseSchemaDetails.spec.ts for subclassing, recursion, and additional API coverage.
 */
export const Square: SquareStatics & ErasedSchema<Square> = eraseSchemaDetails<
	Square,
	SquareStatics
>()(SquareImplementation);

// #endregion

// #region Application consumers: depend only on Square's public types and schema value

describe("Schema erasure library walkthrough", () => {
	it("constructs new content through the domain factory", () => {
		const square: Square = Square.create(3);
		assert.equal(square.area, 9);
		square.resize(4);
		assert.equal(square.area, 16);
		assert(Tree.is(square, Square));
	});

	it("embeds the schema and obtains existing instances through the view", () => {
		const applicationFactory = new SchemaFactory("com.example.geometry.app");
		class Drawing extends applicationFactory.object("Drawing", { square: Square }) {}

		const view = independentView(new TreeViewConfiguration({ schema: Drawing }));
		view.initialize({ square: Square.create(3) });
		// Reading a stored node supplies its domain methods; creating another square is not a load operation.
		const square: Square = view.root.square;
		let changes = 0;
		const unsubscribe = Tree.on(square, "nodeChanged", () => {
			changes += 1;
		});
		try {
			square.resize(5);
			assert.equal(view.root.square.area, 25);
			assert.equal(view.root.square, square);
			assert.equal(changes, 1);
		} finally {
			unsubscribe();
		}
		square.resize(6);
		assert.equal(changes, 1);
	});
});

// #endregion
