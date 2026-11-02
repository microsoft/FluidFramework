/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EmptyKey, rootFieldKey, type NormalizedFieldUpPath } from "../../../core/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
import type { ForestType, TreeCheckout } from "../../../shared-tree/index.js";
import { toInitialSchema } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";
import { fieldJsonCursor } from "../../json/index.js";
import {
	checkoutWithContent,
	chunkFromJsonTrees,
	testIdCompressor,
	jsonTreeFromCheckout,
} from "../../utils.js";

import type { SharedTreeTestOperation } from "./changeGeneration.js";

type SequenceField = "left" | "right";
type FixtureField = SequenceField | "optional";

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

function field(key: FixtureField): NormalizedFieldUpPath {
	const property: NormalizedFieldUpPath = {
		parent: {
			parent: undefined,
			parentField: rootFieldKey,
			parentIndex: 0,
			detachedNodeId: undefined,
		},
		field: brand(key),
	};
	return key === "optional"
		? property
		: {
				parent: {
					parent: property.parent,
					parentField: property.field,
					parentIndex: 0,
					detachedNodeId: undefined,
				},
				field: EmptyKey,
			};
}

/**
 * Read attached content without retaining a cursor across an edit.
 * This reader is specific to the fixture, not an arbitrary-schema generator.
 */
function readFields(checkout: TreeCheckout): {
	left: string[];
	right: string[];
	optional: string | undefined;
} {
	const roots = jsonTreeFromCheckout(checkout);
	assert.equal(roots.length, 1);
	const root = roots[0];
	assert(typeof root === "object" && root !== null && !Array.isArray(root));
	for (const key of Object.keys(root)) {
		assert(["left", "right", "optional"].includes(key));
	}
	const { left, right, optional } = root;
	assert(
		Array.isArray(left) && left.every((value): value is string => typeof value === "string"),
	);
	assert(
		Array.isArray(right) && right.every((value): value is string => typeof value === "string"),
	);
	assert(optional === undefined || typeof optional === "string");
	return { left, right, optional };
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
	const fields = readFields(checkout);
	for (const source of ["left", "right"] as const) {
		const destination = source === "left" ? "right" : "left";
		if (fields[source].length > 0 && fields[destination].length < 2) {
			yield { type: "move", source };
		}
	}
	const value = `N${depth}`;
	if (fields.left.length < 2) {
		yield { type: "insert", value };
	}
	if (fields.left.length > 0) {
		yield { type: "remove" };
	}
	yield { type: "setOptional", value };
	yield { type: "clearOptional" };
}

/**
 * Apply a descriptor to a compatible fixture state, resolving fresh paths and preconditions.
 */
export function applyMultiFieldOperation(
	checkout: TreeCheckout,
	operation: MultiFieldOperationDescriptor,
): void {
	const fields = readFields(checkout);
	switch (operation.type) {
		case "move": {
			const destination = operation.source === "left" ? "right" : "left";
			assert(fields[operation.source].length > 0 && fields[destination].length < 2);
			checkout.editor.move(
				field(operation.source),
				0,
				1,
				field(destination),
				fields[destination].length,
			);
			return;
		}
		case "remove": {
			assert(fields.left.length > 0);
			checkout.editor.sequenceField(field("left")).remove(0, 1);
			return;
		}
		case "clearOptional": {
			checkout.editor
				.optionalField(field("optional"))
				.set(undefined, fields.optional === undefined);
			return;
		}
		case "insert":
		case "setOptional": {
			const chunk = chunkFromJsonTrees([operation.value]);
			try {
				switch (operation.type) {
					case "insert": {
						assert(fields.left.length < 2);
						checkout.editor.sequenceField(field("left")).insert(fields.left.length, chunk);
						break;
					}
					case "setOptional": {
						checkout.editor
							.optionalField(field("optional"))
							.set(chunk, fields.optional === undefined);
						break;
					}
					default: {
						assert.fail("Unknown content operation");
					}
				}
			} finally {
				chunk.referenceRemoved();
			}
			return;
		}
		default: {
			assert.fail("Unknown fixture operation");
		}
	}
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
