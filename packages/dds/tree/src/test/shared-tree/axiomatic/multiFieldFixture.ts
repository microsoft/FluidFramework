/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	Tree,
	type ForestType,
	type SchematizingSimpleTreeView,
	type TreeCheckout,
} from "../../../shared-tree/index.js";
import {
	TreeViewConfiguration,
	SchemaFactory,
	toInitialSchema,
	type ValidateRecursiveSchema,
} from "../../../simple-tree/index.js";
import {
	checkoutWithContent,
	fieldCursorFromInsertable,
	testIdCompressor,
} from "../../utils.js";

import type { SharedTreeTestOperation } from "./changeGeneration.js";

type SequenceFieldKey = "l" | "r";

const sf = new SchemaFactory("axioms");
class Nod extends sf.objectRecursive("Nod", {
	l: sf.requiredRecursive([() => NodArray]),
	r: sf.requiredRecursive([() => NodArray]),
	id: sf.required(sf.string),
}) {}
{
	type _check = ValidateRecursiveSchema<typeof Nod>;
}
class NodArray extends sf.arrayRecursive("NodArray", [() => Nod]) {}
{
	type _check = ValidateRecursiveSchema<typeof NodArray>;
}

function nod(id: string, l?: Nod[], r?: Nod[]): Nod {
	return new Nod({ id, l: new NodArray(l), r: new NodArray(r) });
}
const viewConfiguration = new TreeViewConfiguration({ schema: Nod });

/**
 * Create a JSON object root containing two arrays and an initially absent optional property.
 * The caller owns the checkout.
 */
export function createMultiFieldFixture(forestType: ForestType): TreeCheckout {
	return checkoutWithContent(
		{
			schema: toInitialSchema(Nod),
			initialTree: fieldCursorFromInsertable(Nod, makeInitialTree()),
		},
		{ forestType, idCompressor: testIdCompressor },
	);
}

export function makeInitialTree(): Nod {
	return nod(
		"root",
		[nod("L1"), nod("L2", [nod("LL")], [])],
		[nod("R1"), nod("R2", [], [nod("RR")])],
	);
}

/**
 * Access fixture nodes through a temporary view without taking ownership of the checkout.
 * The callback must not retain nodes beyond the view's lifetime.
 */
function withView<T>(
	checkout: TreeCheckout,
	callback: (view: SchematizingSimpleTreeView<typeof Nod>) => T,
): T {
	const view = checkout.viewWithInternal(viewConfiguration, false);
	try {
		return callback(view);
	} finally {
		view.dispose();
	}
}

export interface FieldLocation {
	readonly parent: string;
	readonly field: SequenceFieldKey;
	readonly index: number;
}

/**
 * Serializable intentions for the bounded fixture vocabulary.
 * Moves and removals target the first node; moves and inserts append to the destination.
 */
export interface MultiFieldOperationDescriptor {
	readonly node: string;
	readonly src: FieldLocation;
	readonly dst: FieldLocation;
	readonly remove: boolean;
}

export interface OperationGeneratorConfig {
	readonly removeMovedNode: boolean;
}

/**
 * Enumerate valid candidates in a stable order from the checkout's current forest.
 * Each depth uses a new content label; sequence destinations contain at most two nodes.
 */
export function* operationDescriptorsFromCheckout(
	checkout: TreeCheckout,
	depth: number,
	config: OperationGeneratorConfig,
): IterableIterator<MultiFieldOperationDescriptor> {
	const view = checkout.viewWithInternal(viewConfiguration, false);
	try {
		const allNods = new Map<string, Nod>();
		const ancestors = new Set<Nod>();
		getAllNods(view.root, allNods);
		yield* operationDescriptorsFromNod(view.root, allNods, ancestors, config);
	} finally {
		view.dispose();
	}
}

export function getAllNods(node: Nod, allNods: Map<string, Nod>): void {
	allNods.set(node.id, node);
	for (const child of node.l) {
		getAllNods(child, allNods);
	}
	for (const child of node.r) {
		getAllNods(child, allNods);
	}
}

export function* operationDescriptorsFromNod(
	node: Nod,
	allNods: Map<string, Nod>,
	ancestors: Set<Nod>,
	config: OperationGeneratorConfig,
): IterableIterator<MultiFieldOperationDescriptor> {
	ancestors.add(node);
	yield* operationDescriptorsFromNodField(node, "l", allNods, ancestors, config);
	yield* operationDescriptorsFromNodField(node, "r", allNods, ancestors, config);
	ancestors.delete(node);
}

export function* operationDescriptorsFromNodField(
	parent: Nod,
	fieldKey: SequenceFieldKey,
	allNods: Map<string, Nod>,
	ancestors: Set<Nod>,
	config: OperationGeneratorConfig,
): IterableIterator<MultiFieldOperationDescriptor> {
	const childCount = parent[fieldKey].length;
	if (childCount === 0) {
		// Do not move nodes into empty arrays
		return;
	}
	for (const [id, node] of allNods.entries()) {
		if (!ancestors.has(node)) {
			const src = nodeLocation(node);
			if (src.parent === parent.id && src.field === fieldKey) {
				// Do not move nodes within the same field of the same parent
				continue;
			}
			yield {
				node: id,
				src,
				dst: { parent: parent.id, field: fieldKey, index: 0 },
				remove: config.removeMovedNode,
			};
			yield {
				node: id,
				src,
				dst: { parent: parent.id, field: fieldKey, index: childCount },
				remove: config.removeMovedNode,
			};
		}
	}
}

export function nodeLocation(node: Nod): FieldLocation {
	const parentArray = Tree.parent(node);
	assert(Tree.is(parentArray, NodArray), "Nod must be under a NodArray");
	const parentNod = Tree.parent(parentArray);
	assert(Tree.is(parentNod, Nod), "NodArray must be under a Nod");
	const field = parentNod.l === parentArray ? "l" : "r";
	const index = parentArray.indexOf(node);
	return { parent: parentNod.id ?? node.id, field, index };
}

/**
 * Apply a descriptor through simple-tree nodes resolved from the target checkout.
 */
export function applyMultiFieldOperation(
	checkout: TreeCheckout,
	operation: MultiFieldOperationDescriptor,
): void {
	const view = checkout.viewWithInternal(viewConfiguration, false);
	try {
		const allNods = new Map<string, Nod>();
		getAllNods(view.root, allNods);
		const moved = allNods.get(operation.node);
		const srcParent = allNods.get(operation.src.parent);
		const dstParent = allNods.get(operation.dst.parent);
		assert(moved !== undefined, "Moved node not found");
		assert(srcParent !== undefined, "Source parent not found");
		assert(dstParent !== undefined, "Destination parent not found");
		const srcField = srcParent[operation.src.field];
		const dstField = dstParent[operation.dst.field];
		view.runTransaction(() => {
			dstField.moveToIndex(operation.dst.index, operation.src.index, srcField);
			if (operation.remove) {
				dstField.removeAt(Tree.key(moved) as number);
			}
		});
	} finally {
		view.dispose();
	}
}

/**
 * Convert serializable descriptors to callbacks for the existing change-capture helper.
 * Descriptions are JSON so a retained history also records its operation intentions.
 */
export function* operationGenerator(
	checkout: TreeCheckout,
	depth: number,
	config: OperationGeneratorConfig,
): IterableIterator<SharedTreeTestOperation> {
	for (const operation of operationDescriptorsFromCheckout(checkout, depth, config)) {
		yield {
			description: JSON.stringify(operation),
			apply: (child) => applyMultiFieldOperation(child, operation),
		};
	}
}
