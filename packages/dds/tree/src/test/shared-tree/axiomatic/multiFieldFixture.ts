/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { JsonAsTree } from "../../../jsonDomainSchema.js";
import { Tree, type ForestType, type TreeCheckout } from "../../../shared-tree/index.js";
import { TreeViewConfiguration, toInitialSchema } from "../../../simple-tree/index.js";
import { fieldJsonCursor } from "../../json/index.js";
import { checkoutWithContent, testIdCompressor } from "../../utils.js";

import type { SharedTreeTestOperation } from "./changeGeneration.js";

type SequenceField = "left" | "right";
const viewConfiguration = new TreeViewConfiguration({ schema: JsonAsTree.JsonObject });

/**
 * Create a JSON object root containing two arrays and an initially absent optional property.
 * The caller owns the checkout.
 */
export function createMultiFieldFixture(forestType: ForestType): TreeCheckout {
	return checkoutWithContent(
		{
			schema: toInitialSchema(JsonAsTree.JsonObject),
			initialTree: fieldJsonCursor([{ left: ["A"], right: ["B"] }]),
		},
		{ forestType, idCompressor: testIdCompressor },
	);
}

/**
 * Access fixture nodes through a temporary view without taking ownership of the checkout.
 * The callback must not retain nodes beyond the view's lifetime.
 */
function withFields<T>(
	checkout: TreeCheckout,
	callback: (
		root: JsonAsTree.JsonObject,
		fields: Record<SequenceField, JsonAsTree.Array>,
	) => T,
): T {
	const view = checkout.viewWithInternal(viewConfiguration, false);
	try {
		const root = view.root;
		for (const key of Object.keys(root)) {
			assert(["left", "right", "optional"].includes(key));
		}
		const { left, right, optional } = root;
		assert(Tree.is(left, JsonAsTree.Array));
		assert(Tree.is(right, JsonAsTree.Array));
		assert(left.every((value) => typeof value === "string"));
		assert(right.every((value) => typeof value === "string"));
		assert(optional === undefined || typeof optional === "string");
		return callback(root, { left, right });
	} finally {
		view.dispose();
	}
}

/**
 * Serializable intentions for the bounded fixture vocabulary.
 * Moves and removals target the first node; moves and inserts append to the destination.
 */
export type MultiFieldOperationDescriptor =
	| { readonly type: "move"; readonly source: SequenceField }
	| { readonly type: "insert" | "setOptional"; readonly value: string }
	| { readonly type: "remove" | "clearOptional" };

/**
 * Enumerate valid candidates in a stable order from the checkout's current forest.
 * Each depth uses a new content label; sequence destinations contain at most two nodes.
 */
export function* multiFieldOperationDescriptors(
	checkout: TreeCheckout,
	depth: number,
): IterableIterator<MultiFieldOperationDescriptor> {
	const lengths = withFields(checkout, (_root, fields) => ({
		left: fields.left.length,
		right: fields.right.length,
	}));
	for (const source of ["left", "right"] as const) {
		const destination = source === "left" ? "right" : "left";
		if (lengths[source] > 0 && lengths[destination] < 2) {
			yield { type: "move", source };
		}
	}
	const value = `N${depth}`;
	if (lengths.left < 2) {
		yield { type: "insert", value };
	}
	if (lengths.left > 0) {
		yield { type: "remove" };
	}
	yield { type: "setOptional", value };
	yield { type: "clearOptional" };
}

/**
 * Apply a descriptor through simple-tree nodes resolved from the target checkout.
 */
export function applyMultiFieldOperation(
	checkout: TreeCheckout,
	operation: MultiFieldOperationDescriptor,
): void {
	withFields(checkout, (root, fields) => {
		switch (operation.type) {
			case "move": {
				const destination = operation.source === "left" ? "right" : "left";
				assert(fields[operation.source].length > 0 && fields[destination].length < 2);
				fields[destination].moveToEnd(0, fields[operation.source]);
				break;
			}
			case "remove": {
				assert(fields.left.length > 0);
				fields.left.removeAt(0);
				break;
			}
			case "clearOptional": {
				// Assignment, unlike deleting an absent property, submits an empty clear.
				root.optional = undefined;
				break;
			}
			case "insert": {
				assert(fields.left.length < 2);
				fields.left.insertAtEnd(operation.value);
				break;
			}
			case "setOptional": {
				root.optional = operation.value;
				break;
			}
			default: {
				assert.fail("Unknown fixture operation");
			}
		}
	});
}

/**
 * Convert serializable descriptors to callbacks for the existing change-capture helper.
 * Descriptions are JSON so a retained history also records its operation intentions.
 */
export function* multiFieldOperations(
	checkout: TreeCheckout,
	depth: number,
): IterableIterator<SharedTreeTestOperation> {
	for (const operation of multiFieldOperationDescriptors(checkout, depth)) {
		yield {
			description: JSON.stringify(operation),
			apply: (child) => applyMultiFieldOperation(child, operation),
		};
	}
}
