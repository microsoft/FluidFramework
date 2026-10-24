/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	normalizeAndEvaluateAnnotatedAllowedTypes,
	type AnnotatedAllowedType,
	type AllowedTypesFullEvaluated,
	markSchemaMostDerived,
} from "./allowedTypes.js";
import { getTreeNodeSchemaPrivateData, type TreeNodeSchema } from "./treeNodeSchema.js";

/**
 * Traverses all {@link TreeNodeSchema} schema reachable from `schema`, applying the visitor pattern.
 * @internal
 */
export function walkNodeSchema(
	schema: TreeNodeSchema,
	visitor: SchemaVisitor,
	visitedSet: Set<TreeNodeSchema>,
): void {
	walkSchema([schema], visitor, visitedSet);
}

/**
 * Traverses all {@link TreeNodeSchema} schema reachable from `allowedTypes`, applying the visitor pattern.
 * @internal
 */
export function walkAllowedTypes(
	annotatedAllowedTypes: AllowedTypesFullEvaluated,
	visitor: SchemaVisitor,
	visitedSet: Set<TreeNodeSchema> = new Set(),
): void {
	walkSchema(visitAllowedTypes(annotatedAllowedTypes, visitor), visitor, visitedSet);
}

/**
 * Traverses node roots using iterative DFS with optional Tarjan bookkeeping.
 * @remarks
 * Walks without a component callback allocate no component state.
 * Nodes already in `visited` are outside this walk's graph.
 *
 * `isComplete` is reserved for unfiltered derived-state analysis: it certifies completed transitive topology.
 * In this mode only new components are reported, but an `allowedTypes` callback still visits cached schemas.
 * It cannot be combined with node callbacks or filtering.
 * Ordinary visitor entry points do not use this cache and report every visited component.
 * Failed walks discard unfinished components; completed dependencies can remain cached.
 * @internal
 */
export function walkSchema(
	roots: Iterable<TreeNodeSchema>,
	visitor: SchemaVisitor,
	visited: Set<TreeNodeSchema> = new Set(),
	isComplete?: (schema: TreeNodeSchema) => boolean,
): void {
	assert(
		isComplete === undefined ||
			(visitor.stronglyConnectedComponent !== undefined &&
				visitor.node === undefined &&
				visitor.allowedTypeFilter === undefined),
		"Cached analysis requires unfiltered component traversal without node callbacks",
	);
	interface ComponentState {
		readonly schema: TreeNodeSchema;
		readonly index: number;
		lowLink: number;
		onStack: boolean;
	}
	interface Frame {
		readonly schema: TreeNodeSchema;
		readonly references: Iterator<TreeNodeSchema>;
		readonly componentState: ComponentState | undefined;
	}
	const analysis =
		visitor.stronglyConnectedComponent === undefined
			? undefined
			: {
					completed: visitor.stronglyConnectedComponent,
					states: new Map<TreeNodeSchema, ComponentState>(),
					stack: new Array<ComponentState>(),
				};
	const pending: Frame[] = [];
	const pruneCompleted = isComplete !== undefined && visitor.allowedTypes === undefined;
	const referenceVisitor: SchemaVisitor = pruneCompleted
		? { allowedTypeFilter: ({ type }) => !isComplete(type) }
		: visitor;

	function* references(schema: TreeNodeSchema): IterableIterator<TreeNodeSchema> {
		// Do not initialize contexts: this walk is itself used during node initialization.
		for (const field of getTreeNodeSchemaPrivateData(schema).childAllowedTypes) {
			const types = normalizeAndEvaluateAnnotatedAllowedTypes(field);
			// Preserve the full annotation sequence, but do not yield completed dependencies into the DFS loop.
			yield* visitAllowedTypes(types, referenceVisitor);
		}
	}

	function discover(schema: TreeNodeSchema): void {
		if (visited.has(schema)) {
			return;
		}
		visited.add(schema);
		// Cached topology needs no new component state, but field callbacks still require traversal.
		if (pruneCompleted && isComplete(schema)) {
			return;
		}
		markSchemaMostDerived(schema, false);
		let componentState: ComponentState | undefined;
		// Without field callbacks, the cutoff above already established that this node is new.
		if (analysis !== undefined && (pruneCompleted || !(isComplete?.(schema) ?? false))) {
			componentState = {
				schema,
				index: analysis.states.size,
				lowLink: analysis.states.size,
				onStack: true,
			};
			analysis.states.set(schema, componentState);
			analysis.stack.push(componentState);
		}
		pending.push({
			schema,
			componentState,
			references: references(schema),
		});
	}

	function finishComponentFrame(
		componentAnalysis: NonNullable<typeof analysis>,
		componentState: ComponentState,
		parentState: ComponentState | undefined,
	): void {
		if (componentState.lowLink === componentState.index) {
			const members: TreeNodeSchema[] = [];
			let member: ComponentState;
			do {
				const popped = componentAnalysis.stack.pop();
				assert(popped !== undefined, "Expected a component member");
				member = popped;
				member.onStack = false;
				members.push(member.schema);
			} while (member !== componentState);
			componentAnalysis.completed(members);
		}
		if (parentState !== undefined) {
			parentState.lowLink = Math.min(parentState.lowLink, componentState.lowLink);
		}
	}

	for (const root of roots) {
		discover(root);
		let current = pending.at(-1);
		while (current !== undefined) {
			const next = current.references.next();
			const componentState = current.componentState;
			if (next.done === true) {
				pending.pop();
				visitor.node?.(current.schema);
				if (componentState !== undefined && analysis !== undefined) {
					finishComponentFrame(analysis, componentState, pending.at(-1)?.componentState);
				}
			} else {
				const child = analysis?.states.get(next.value);
				if (componentState !== undefined && child?.onStack === true) {
					componentState.lowLink = Math.min(componentState.lowLink, child.index);
				}
				discover(next.value);
			}
			current = pending.at(-1);
		}
	}
}

function* visitAllowedTypes(
	annotatedAllowedTypes: AllowedTypesFullEvaluated,
	visitor: SchemaVisitor,
): IterableIterator<TreeNodeSchema> {
	for (const allowedType of annotatedAllowedTypes.types) {
		const filter = visitor.allowedTypeFilter;
		if (filter === undefined || filter(allowedType)) {
			yield allowedType.type;
		}
	}
	visitor.allowedTypes?.(annotatedAllowedTypes);
}

/**
 * Callbacks and options for use in {@link walkFieldSchema} / {@link walkAllowedTypes} / {@link walkNodeSchema}.
 * @internal
 */
export interface SchemaVisitor {
	/**
	 * Called once for each node schema reached, after walking its fields.
	 */
	node?: (schema: TreeNodeSchema) => void;
	/**
	 * Called once for each strongly connected component, with all its node schemas.
	 * @remarks
	 * Each visited schema identity belongs to exactly one component, including singleton leaf and non-recursive schemas.
	 * Components describe the graph selected by {@link SchemaVisitor.allowedTypeFilter}.
	 * Nodes already in the walk's visited set are excluded.
	 *
	 * Called after every member's {@link SchemaVisitor.node} callback and after all outgoing dependency components.
	 * Member order is unspecified. Node and allowed-type callbacks retain their ordinary traversal order.
	 * Previously cached schema analysis does not suppress these notifications.
	 * A throwing walk need not report unfinished components.
	 */
	stronglyConnectedComponent?: (schemas: readonly TreeNodeSchema[]) => void;
	/**
	 * Called once for each set of allowed types.
	 * @remarks
	 * This includes every field, as well as the allowed types for maps and arrays nodes and the root if starting at {@link walkAllowedTypes}.
	 *
	 * Each allowed types in the schema is visited as it was in the original schema except for normalization.
	 *
	 * Called after walking the allowed types selected by {@link SchemaVisitor.allowedTypeFilter}.
	 */
	allowedTypes?: (allowedTypes: AllowedTypesFullEvaluated) => void;
	/**
	 * If true, will walk into this `allowedType`.
	 * If false, the `allowedType` will not be walked into.
	 *
	 * If not provided, all allowedTypes will be walked into.
	 * @remarks
	 * Called before walking each reference, including references to already visited nodes.
	 * @privateRemarks
	 * It would be possible to combine this with `allowedTypes` into a single callback, but for the current usage this separation is more convenient.
	 */
	allowedTypeFilter?: (allowedType: AnnotatedAllowedType<TreeNodeSchema>) => boolean;
}
