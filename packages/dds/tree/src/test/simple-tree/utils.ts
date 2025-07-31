/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	isTreeNode,
	isTreeNodeSchemaClass,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableField,
	type InsertableTreeFieldFromImplicitField,
	type NodeKind,
	type TreeFieldFromImplicitField,
	type TreeLeafValue,
	type TreeNode,
	type TreeNodeSchema,
	type UnsafeUnknownSchema,
} from "../../simple-tree/index.js";
import { getView } from "../utils.js";
import type { TreeCheckout } from "../../shared-tree/index.js";
import { SchematizingSimpleTreeView } from "../../shared-tree/index.js";
import type { FieldKindIdentifier } from "../../core/index.js";
import { brand } from "../../util/index.js";
import type {
	FieldDiscrepancy,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/api/discrepancies.js";

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

/**
 * TODO: This is used by SchemaCompatibilityTester, revisit it during redesign and document
 */
export function comparePosetElements<T>(
	a: T,
	b: T,
	realizer: Realizer<T>,
): PosetComparisonResult {
	let hasLessThanResult = false;
	let hasGreaterThanResult = false;
	for (const extension of realizer) {
		const aIndex = extension.get(a);
		const bIndex = extension.get(b);
		assert(aIndex !== undefined && bIndex !== undefined, "Invalid realizer");
		if (aIndex < bIndex) {
			hasLessThanResult = true;
		} else if (aIndex > bIndex) {
			hasGreaterThanResult = true;
		}
	}

	return hasLessThanResult
		? hasGreaterThanResult
			? PosetComparisonResult.Incomparable
			: PosetComparisonResult.Less
		: hasGreaterThanResult
			? PosetComparisonResult.Greater
			: PosetComparisonResult.Equal;
}

export const PosetComparisonResult = {
	Less: "<",
	Greater: ">",
	Equal: "=",
	Incomparable: "||",
} as const;
type PosetComparisonResult =
	(typeof PosetComparisonResult)[keyof typeof PosetComparisonResult];

/**
 * A linear extension of a partially-ordered set of `T`s. See:
 * https://en.wikipedia.org/wiki/Linear_extension
 *
 * The linear extension is represented as a lookup from each poset element to its index in the linear extension.
 */
export type LinearExtension<T> = Map<T, number>;

/**
 * A realizer for a partially-ordered set. See:
 * https://en.wikipedia.org/wiki/Order_dimension
 */
export type Realizer<T> = LinearExtension<T>[];

/**
 * @privateRemarks
 * TODO: Knowledge of specific field kinds is not appropriate for modular schema.
 * This bit of field comparison should be dependency injected by default-schema if this comparison logic remains in modular-schema
 * (this is analogous to what is done in comparison.ts).
 */
const FieldKindIdentifiers = {
	forbidden: brand<FieldKindIdentifier>("Forbidden"),
	required: brand<FieldKindIdentifier>("Value"),
	identifier: brand<FieldKindIdentifier>("Identifier"),
	optional: brand<FieldKindIdentifier>("Optional"),
	sequence: brand<FieldKindIdentifier>("Sequence"),
};

/**
 * A realizer for the partial order of field kind relaxability.
 *
 * It seems extremely likely that this partial order will remain dimension 2 over time (i.e. the set of allowed relaxations can be visualized
 * with a [dominance drawing](https://en.wikipedia.org/wiki/Dominance_drawing)), so this strategy allows efficient comarison between field kinds
 * without excessive casework.
 *
 * Hasse diagram for the partial order is shown below (lower fields can be relaxed to higher fields):
 * ```
 * sequence
 *    |
 * optional
 *    |    \
 * required forbidden
 *    |
 * identifier
 * ```
 */
export const fieldRealizer: Realizer<FieldKindIdentifier> = [
	[
		FieldKindIdentifiers.forbidden,
		FieldKindIdentifiers.identifier,
		FieldKindIdentifiers.required,
		FieldKindIdentifiers.optional,
		FieldKindIdentifiers.sequence,
	],
	[
		FieldKindIdentifiers.identifier,
		FieldKindIdentifiers.required,
		FieldKindIdentifiers.forbidden,
		FieldKindIdentifiers.optional,
		FieldKindIdentifiers.sequence,
	],
].map((extension) => new Map(extension.map((identifier, index) => [identifier, index])));
