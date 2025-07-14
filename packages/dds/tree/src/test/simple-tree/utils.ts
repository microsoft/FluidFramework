/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	comparePosetElements,
	fieldRealizer,
	getAllowedContentDiscrepancies,
	isTreeNode,
	isTreeNodeSchemaClass,
	PosetComparisonResult,
	TreeViewConfiguration,
	type FieldDiscrepancy,
	type FieldSchema,
	type ImplicitFieldSchema,
	type InsertableField,
	type InsertableTreeFieldFromImplicitField,
	type NodeKind,
	type Realizer,
	type TreeFieldFromImplicitField,
	type TreeLeafValue,
	type TreeNode,
	type TreeNodeSchema,
	type UnsafeUnknownSchema,
} from "../../simple-tree/index.js";
import { getView } from "../utils.js";
import type { TreeCheckout } from "../../shared-tree/index.js";
import { SchematizingSimpleTreeView } from "../../shared-tree/index.js";
import type { TreeStoredSchema } from "../../core/index.js";
import assert from "node:assert";

/**
 * Initializes a node with the given schema and content.
 * @param schema - The schema of the node being initialized
 * @param content - The content that will be used to construct the node, or an unhydrated node of the correct `schema`.
 * @param hydrateNode - Whether or not the returned value will be hydrated.
 * @returns
 * * If `hydrateNode` is true, a hydrated node will be returned.
 * * If `hydrateNode` is false, then `content` will be used to initialize an unhydrated node (or, if `content` is already a hydrated node, it will be returned directly).
 * @remarks This function is useful for writing tests that want to test both the hydrated version of a node and the unhydrated version of a node with minimal code duplication.
 */
export function initNode<
	TInsertable,
	TSchema extends TreeNodeSchema<string, NodeKind, TreeNode | TreeLeafValue, TInsertable>,
>(
	schema: TSchema,
	content: TInsertable,
	hydrateNode: boolean,
): TreeFieldFromImplicitField<TSchema> {
	if (hydrateNode) {
		return hydrate(schema, content as InsertableField<TSchema>);
	}

	if (isTreeNode(content)) {
		return content as TreeFieldFromImplicitField<TSchema>;
	}

	if (isTreeNodeSchemaClass(schema)) {
		return new schema(content) as TreeFieldFromImplicitField<TSchema>;
	}

	return schema.create(content) as TreeFieldFromImplicitField<TSchema>;
}

/**
 * Generates a `describe` block for test suites that want to test both unhydrated and hydrated nodes.
 * @param title - the title of the test suite
 * @param runBoth - a suite that will be run twice, each in a different nested `describe` block.
 * The suite has access to an initialize function (see {@link initNode}) and a boolean that can be used to produce unhydrated nodes or hydrated nodes.
 * @param runOnce - an optional extra delegate that will run inside of the outer describe block.
 * This is useful for test cases that don't distinguish between unhydrated and hydrated scenarios.
 */
export function describeHydration(
	title: string,
	runBoth: (
		init: <
			TInsertable,
			TSchema extends TreeNodeSchema<string, NodeKind, TreeNode | TreeLeafValue, TInsertable>,
		>(
			schema: TSchema,
			tree: TInsertable,
		) => TreeFieldFromImplicitField<TSchema>,
		hydrated: boolean,
	) => void,
	runOnce?: () => void,
) {
	return describe(title, () => {
		describe("🐪 Unhydrated", () =>
			runBoth((schema, tree) => initNode(schema, tree, false), false));

		describe("🌊 Hydrated", () =>
			runBoth((schema, tree) => initNode(schema, tree, true), true));

		runOnce?.();
	});
}

/**
 * Given the schema and initial tree data, returns a hydrated tree node.
 * @remarks
 * For minimal/concise targeted unit testing of specific simple-tree content.
 *
 * This produces "marinated" nodes, meaning hydrated nodes which may not have an inner node cached yet.
 */
export function hydrate<const TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	initialTree: InsertableField<TSchema> | InsertableTreeFieldFromImplicitField<TSchema>,
): TreeFieldFromImplicitField<TSchema> {
	const view = getView(new TreeViewConfiguration({ schema, enableSchemaValidation: true }));
	view.initialize(initialTree as InsertableField<TSchema>);
	return view.root;
}

/**
 * {@link hydrate} but unsafe initialTree.
 * This may be required when the schema is not entirely statically typed, for example when looping over multiple test cases and thus using a imprecise schema type.
 * In such cases the "safe" version of hydrate may require `never` for the initial tree.
 */
export function hydrateUnsafe<const TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	initialTree: InsertableField<UnsafeUnknownSchema>,
): TreeFieldFromImplicitField<TSchema> {
	return hydrate(schema, initialTree as InsertableField<TSchema>);
}

/**
 * Similar to JSON stringify, but allows `undefined` at the root and returns numbers as-is at the root.
 */
export function pretty(arg: unknown): number | string {
	if (arg === undefined) {
		return "undefined";
	}
	if (typeof arg === "number") {
		return arg;
	}
	return JSON.stringify(arg);
}

/**
 * Creates a branch of the input tree view and returns a new tree view for the branch.
 *
 * @remarks To merge the branch back into the original view after applying changes on the branch view, use
 * `<originalView>.checkout.merge(<branchView>.checkout)`.
 *
 * @param originalView - The tree view to branch.
 * @returns A new tree view for a branch of the input tree view, and an {@link TreeCheckoutFork} object that can be
 * used to merge the branch back into the original view.
 */
export function getViewForForkedBranch<const TSchema extends ImplicitFieldSchema>(
	originalView: SchematizingSimpleTreeView<TSchema>,
): { forkView: SchematizingSimpleTreeView<TSchema>; forkCheckout: TreeCheckout } {
	const forkCheckout = originalView.checkout.branch();
	return {
		forkView: new SchematizingSimpleTreeView<TSchema>(
			forkCheckout,
			originalView.config,
			originalView.nodeKeyManager,
		),
		forkCheckout,
	};
}

/**
 * This function uses discrepancies to determine if replacing the provided stored schema to a stored schema derived from the provided view schema would support a superset of the documents permitted by the provided stored schema.
 *
 * @remarks
 * According to the policy of schema evolution, this function supports three types of changes:
 * 1. Adding an optional field to an object node.
 * 2. Expanding the set of allowed types for a field.
 * 3. Relaxing a field kind to a more general field kind
 * 4. Adding new node schema
 * 5. Arbitrary changes to persisted metadata
 *
 * Notes: We expect this to return consistent results with allowsRepoSuperset. However, currently there are some scenarios
 * where the inconsistency will occur:
 * - Different Node Kinds: If view and stored have different node kinds (e.g., view is an objectNodeSchema and stored is a mapNodeSchema),
 * This will determine that view can never be the superset of stored. In contrast, `allowsRepoSuperset` will continue
 * validating internal fields.
 *
 * TODO: Evaluate if this function is needed at all. It is only used in tests and could possibly be replaced with `allowsRepoSuperset`.
 * Maybe production code for canUpgrade should be using this?
 */
export function isViewSupersetOfStored(view: FieldSchema, stored: TreeStoredSchema): boolean {
	const discrepancies = getAllowedContentDiscrepancies(view, stored);

	for (const discrepancy of discrepancies) {
		switch (discrepancy.mismatch) {
			case "nodeKind": {
				if (discrepancy.stored !== undefined) {
					// It's fine for the view schema to know of a node type that the stored schema doesn't know about.
					return false;
				}
				break;
			}
			case "valueSchema":
			case "allowedTypes":
			case "fieldKind": {
				if (!isFieldDiscrepancyCompatible(discrepancy)) {
					return false;
				}
				break;
			}
			case "fields": {
				if (
					discrepancy.differences.some(
						(difference) => !isFieldDiscrepancyCompatible(difference),
					)
				) {
					return false;
				}
				break;
			}
			// No default
		}
	}
	return true;
}

function isFieldDiscrepancyCompatible(discrepancy: FieldDiscrepancy): boolean {
	switch (discrepancy.mismatch) {
		case "allowedTypes": {
			// Since we only track the symmetric difference between the allowed types in the view and
			// stored schemas, it's sufficient to check if any extra allowed types still exist in the
			// stored schema.
			return discrepancy.stored.length === 0;
		}
		case "fieldKind": {
			return posetLte(discrepancy.stored, discrepancy.view, fieldRealizer);
		}
		case "valueSchema": {
			return false;
		}
		// No default
	}
	return false;
}

export function posetLte<T>(a: T, b: T, realizer: Realizer<T>): boolean {
	const comparison = comparePosetElements(a, b, realizer);
	return (
		comparison === PosetComparisonResult.Less || comparison === PosetComparisonResult.Equal
	);
}

export function expectTreesEqual(
	a: TreeNode | TreeLeafValue | undefined,
	b: TreeNode | TreeLeafValue | undefined,
): void {
	if (a === undefined || b === undefined) {
		assert.equal(a === undefined, b === undefined);
		return;
	}

	// Validate the same schema objects are used.
	assert.equal(Tree.schema(a), Tree.schema(b));

	// This should catch all cases, assuming exportVerbose works correctly.
	assert.deepEqual(TreeAlpha.exportVerbose(a), TreeAlpha.exportVerbose(b));

	// Since this uses some of the tools to compare trees that this is testing for, perform the comparison in a few ways to reduce risk of a bug making this pass when it shouldn't:
	// This case could have false negatives (two trees with ambiguous schema could export the same concise tree),
	// but should have no false positives since equal trees always have the same concise tree.
	assert.deepEqual(TreeAlpha.exportConcise(a), TreeAlpha.exportConcise(b));
}
