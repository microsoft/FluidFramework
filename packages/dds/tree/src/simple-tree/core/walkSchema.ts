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
 * An {@link IncrementalSchemaVisitor} can omit component visits already completed by the caller.
 * Ordinary {@link SchemaVisitor}s report every visited component, independently of caller-owned results.
 * The walker retains no state between calls. Failed walks discard unfinished components;
 * results from successfully completed component callbacks remain the caller's responsibility.
 * @internal
 */
export function walkSchema(
	roots: Iterable<TreeNodeSchema>,
	visitor: SchemaVisitor | IncrementalSchemaVisitor,
	visited: Set<TreeNodeSchema> = new Set(),
): void {
	const { wasComponentVisited } = visitor;
	assert(
		wasComponentVisited === undefined ||
			(visitor.stronglyConnectedComponent !== undefined &&
				visitor.node === undefined &&
				visitor.allowedTypeFilter === undefined),
		"Incremental component visits require a component callback without node callbacks or filtering",
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
	const pruneVisitedComponents =
		wasComponentVisited !== undefined && visitor.allowedTypes === undefined;
	const referenceVisitor: Pick<SchemaVisitor, "allowedTypes" | "allowedTypeFilter"> =
		pruneVisitedComponents
			? { allowedTypeFilter: ({ type }) => !wasComponentVisited(type) }
			: visitor;

	function* references(schema: TreeNodeSchema): IterableIterator<TreeNodeSchema> {
		// Do not initialize contexts: this walk is itself used during node initialization.
		for (const field of getTreeNodeSchemaPrivateData(schema).childAllowedTypes) {
			const types = normalizeAndEvaluateAnnotatedAllowedTypes(field);
			// Preserve the full annotation sequence, but prune previously visited components before yielding.
			yield* visitAllowedTypes(types, referenceVisitor);
		}
	}

	function discover(schema: TreeNodeSchema): void {
		if (visited.has(schema)) {
			return;
		}
		visited.add(schema);
		// Previously visited components need no new component state, but field callbacks still require traversal.
		if (pruneVisitedComponents && wasComponentVisited(schema)) {
			return;
		}
		markSchemaMostDerived(schema, false);
		let componentState: ComponentState | undefined;
		// Without field callbacks, the cutoff above already established that this node is new.
		if (
			analysis !== undefined &&
			(pruneVisitedComponents || !(wasComponentVisited?.(schema) ?? false))
		) {
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
	visitor: Pick<SchemaVisitor, "allowedTypes" | "allowedTypeFilter">,
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
 * Callbacks and options for ordinary schema walks.
 * Used by {@link walkFieldSchema}, {@link walkAllowedTypes}, {@link walkNodeSchema}, and the package-private `walkSchema`.
 * @internal
 */
export interface SchemaVisitor {
	/**
	 * Ordinary walks cannot suppress previously completed component visits.
	 * Use the package-private `IncrementalSchemaVisitor` with `walkSchema` instead.
	 */
	wasComponentVisited?: never;
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

/**
 * A visitor for incrementally visiting components of the unfiltered schema graph with {@link walkSchema}.
 * @remarks
 * Reuses {@link SchemaVisitor}'s component and allowed-type callbacks.
 * Unlike an ordinary visitor, it reports only components not covered by {@link IncrementalSchemaVisitor.wasComponentVisited}.
 * Outgoing dependency components have either completed their callback in this walk or are covered by that predicate.
 *
 * Use this when component callbacks produce reusable caller-owned results, while allowed-type callbacks perform
 * checks required on every pass, such as configuration-specific validation.
 * No cache is maintained by the walker, and retaining cached results is not required by this interface.
 * Node callbacks and edge filtering are excluded: this mode relies on completed visits of whole unfiltered components.
 * Neither the callbacks nor the predicate may initialize node contexts during schema discovery.
 * @internal
 */
export interface IncrementalSchemaVisitor
	extends Pick<SchemaVisitor, "allowedTypes">,
		Required<Pick<SchemaVisitor, "stronglyConnectedComponent">> {
	/**
	 * Returns whether the caller has successfully completed a {@link SchemaVisitor.stronglyConnectedComponent}
	 * visit for this schema's component and all its reachable dependency components.
	 * @remarks
	 * The caller owns this knowledge. It may come from earlier walks or callbacks completed earlier in this walk.
	 * The predicate need not track the current traversal: the walker handles repeat references and cycles.
	 * Discovering a node, calling its node visitor, or starting a component callback does not constitute a completed visit.
	 *
	 * A `true` answer must cover the entire component and its transitive dependencies, never part of a cycle
	 * or in-progress work. Completed visits must remain valid while the walk runs.
	 * The predicate may be called multiple times for a schema; it must not depend on call count or cause traversal side effects.
	 *
	 * Returning `true` suppresses component callbacks for that completed subgraph.
	 * Without an {@link SchemaVisitor.allowedTypes} callback, traversal stops at that schema.
	 * With that callback, the walker still traverses its fields and dependencies in ordinary visitor order.
	 *
	 * Unlike prepopulating `walkSchema`'s visited set, this promises completed component visits
	 * rather than merely excluding nodes from the traversal graph.
	 * A previsited node receives no field callbacks; this predicate does not suppress requested field callbacks.
	 */
	wasComponentVisited: (schema: TreeNodeSchema) => boolean;
	/**
	 * Incremental component visits do not support node callbacks.
	 */
	node?: never;
	/**
	 * Previous component visits must describe the same unfiltered topology.
	 */
	allowedTypeFilter?: never;
}
