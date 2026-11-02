/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	ValueSchema,
	rootFieldKey,
	type FieldKey,
	type JsonableTree,
	type NormalizedFieldUpPath,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
} from "../../../core/index.js";
import { FieldKinds, cursorForJsonableTreeField } from "../../../feature-libraries/index.js";
import type { ForestType, TreeCheckout } from "../../../shared-tree/index.js";
import { stringSchema } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";
import {
	checkoutWithContent,
	chunkFromJsonableTrees,
	testIdCompressor,
	toJsonableTree,
} from "../../utils.js";

import type { SharedTreeTestOperation } from "./changeGeneration.js";

const rootType = brand<TreeNodeSchemaIdentifier>("axiomatic.multiField.root");
const leafType = brand<TreeNodeSchemaIdentifier>(stringSchema.identifier);

type SequenceField = "left" | "right";
type FixtureField = SequenceField | "optional" | "required";

function leaf(value: string): JsonableTree {
	return { type: leafType, value };
}

/**
 * Build explicit expected content for the fixed four-field fixture.
 */
export function multiFieldContent(
	left: string[],
	right: string[],
	optional?: string,
	required: string = "required",
): JsonableTree[] {
	return [
		{
			type: rootType,
			fields: {
				...(left.length === 0 ? {} : { left: left.map(leaf) }),
				...(right.length === 0 ? {} : { right: right.map(leaf) }),
				...(optional === undefined ? {} : { optional: [leaf(optional)] }),
				required: [leaf(required)],
			},
		},
	];
}

const leafField = (kind: TreeFieldStoredSchema["kind"]): TreeFieldStoredSchema => ({
	kind,
	types: new Set([leafType]),
	persistedMetadata: undefined,
});

const schema = {
	rootFieldSchema: {
		kind: FieldKinds.required.identifier,
		types: new Set([rootType]),
		persistedMetadata: undefined,
	},
	nodeSchema: new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
		[
			rootType,
			new ObjectNodeStoredSchema(
				new Map<FieldKey, TreeFieldStoredSchema>([
					[brand("left"), leafField(FieldKinds.sequence.identifier)],
					[brand("right"), leafField(FieldKinds.sequence.identifier)],
					[brand("optional"), leafField(FieldKinds.optional.identifier)],
					[brand("required"), leafField(FieldKinds.required.identifier)],
				]),
			),
		],
		[leafType, new LeafNodeStoredSchema(ValueSchema.String)],
	]),
};

/**
 * Create a checkout with direct sequence fields, an empty optional field, and a required string.
 * The caller owns the checkout.
 */
export function createMultiFieldFixture(forestType: ForestType): TreeCheckout {
	return checkoutWithContent(
		{ schema, initialTree: cursorForJsonableTreeField(multiFieldContent(["A"], ["B"])) },
		{ forestType, idCompressor: testIdCompressor },
	);
}

function field(key: FixtureField): NormalizedFieldUpPath {
	return {
		parent: {
			parent: undefined,
			parentField: rootFieldKey,
			parentIndex: 0,
			detachedNodeId: undefined,
		},
		field: brand(key),
	};
}

/**
 * Read attached content without retaining a cursor across an edit.
 * This reader is specific to the fixture, not an arbitrary-schema generator.
 */
function readFields(checkout: TreeCheckout): Record<FixtureField, readonly JsonableTree[]> {
	const roots = toJsonableTree(checkout);
	assert.equal(roots.length, 1);
	const root = roots[0];
	assert.equal(root.type, rootType);
	const fields = {
		left: root.fields?.left ?? [],
		right: root.fields?.right ?? [],
		optional: root.fields?.optional ?? [],
		required: root.fields?.required ?? [],
	};
	for (const key of Object.keys(root.fields ?? {})) {
		assert(["left", "right", "optional", "required"].includes(key));
	}
	assert(fields.optional.length <= 1);
	assert.equal(fields.required.length, 1);
	for (const nodes of Object.values(fields)) {
		for (const node of nodes) {
			assert.equal(node.type, leafType);
			assert.equal(typeof node.value, "string");
			assert.equal(Object.keys(node.fields ?? {}).length, 0);
		}
	}
	return fields;
}

/**
 * Serializable intentions for the bounded fixture vocabulary.
 * Moves and removals target the first node; moves and inserts append to the destination.
 */
export type MultiFieldOperationDescriptor =
	| { readonly type: "move"; readonly source: SequenceField }
	| { readonly type: "insert" | "setOptional" | "setRequired"; readonly value: string }
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
	yield { type: "setRequired", value };
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
				.set(undefined, fields.optional.length === 0);
			return;
		}
		case "insert":
		case "setOptional":
		case "setRequired": {
			const chunk = chunkFromJsonableTrees([leaf(operation.value)]);
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
							.set(chunk, fields.optional.length === 0);
						break;
					}
					case "setRequired": {
						checkout.editor.valueField(field("required")).set(chunk);
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
