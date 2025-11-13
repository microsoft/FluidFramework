/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Grocery } from "../domains/index.js";

/**
 * Snapshot of a grocery item used in linked list scenarios.
 */
export interface GrocerySnapshot {
	readonly name: string;
	readonly price: number;
	readonly purchased: boolean;
}

/**
 * Groceries in alphabetical order used to seed linked list scenarios.
 */
export const alphabeticalGroceries: readonly GrocerySnapshot[] = [
	{ name: "Apples", price: 1.49, purchased: false },
	{ name: "Bananas", price: 0.79, purchased: false },
	{ name: "Carrots", price: 1.09, purchased: false },
	{ name: "Dill", price: 2.49, purchased: false },
	{ name: "Eggs", price: 3.39, purchased: false },
	{ name: "Flour", price: 2.89, purchased: false },
	{ name: "Grapes", price: 2.69, purchased: false },
	{ name: "Honey", price: 6.99, purchased: false },
	{ name: "Iceberg Lettuce", price: 1.79, purchased: false },
	{ name: "Jam", price: 4.59, purchased: false },
] as const satisfies readonly GrocerySnapshot[];

/**
 * Builds a linked list of {@link Grocery} nodes from the provided snapshots.
 */
function buildLinkedGroceriesFrom(items: readonly GrocerySnapshot[]): Grocery {
	let next: Grocery | undefined;
	for (let index = items.length - 1; index >= 0; index--) {
		const item = items[index];
		if (item === undefined) {
			throw new Error("Unexpected missing grocery item");
		}
		next = new Grocery({
			name: item.name,
			price: item.price,
			purchased: item.purchased,
			nextGrocery: next,
		});
	}
	if (next === undefined) {
		throw new Error("Expected at least one grocery item");
	}
	return next;
}

/**
 * Creates the default alphabetical linked list of groceries.
 */
export function buildAlphabeticalLinkedGroceries(): Grocery {
	return buildLinkedGroceriesFrom(alphabeticalGroceries);
}

/**
 * Validates that the linked list rooted at {@link node} matches {@link expectedItems}.
 */
export function verifyLinkedGroceries(
	node: unknown,
	expectedItems: readonly GrocerySnapshot[],
	index = 0,
): boolean {
	if (index >= expectedItems.length) {
		return node === undefined;
	}
	if (
		typeof node !== "object" ||
		node === null ||
		Array.isArray((node as { fields?: unknown }).fields)
	) {
		return false;
	}
	const verboseNode = node as { type?: unknown; fields?: Record<string, unknown> };
	if (verboseNode.type !== "com.microsoft.fluid.tree-agent.groceries.Grocery") {
		return false;
	}
	const fields = verboseNode.fields;
	if (
		fields === undefined ||
		typeof fields !== "object" ||
		fields === null ||
		Array.isArray(fields)
	) {
		return false;
	}
	const record = fields;
	const expected = expectedItems[index];
	if (expected === undefined) {
		return false;
	}
	const name = record.name;
	if (typeof name !== "string" || name !== expected.name) {
		return false;
	}
	const price = record.price;
	if (typeof price !== "number" || Math.abs(price - expected.price) > 1e-9) {
		return false;
	}
	const purchased = record.purchased;
	if (typeof purchased !== "boolean" || purchased !== expected.purchased) {
		return false;
	}
	const next = record.nextGrocery;
	if (index === expectedItems.length - 1) {
		return next === undefined;
	}
	return verifyLinkedGroceries(next, expectedItems, index + 1);
}
