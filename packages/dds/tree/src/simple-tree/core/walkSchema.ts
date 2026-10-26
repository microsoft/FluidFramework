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
 * @remarks
 * Includes `schema` itself unless it is already in `visitedSet`; filtering applies to its child references.
 * Updates `visitedSet` as nodes are discovered, including when a later callback or schema evaluation throws.
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
 * Traverses all {@link TreeNodeSchema} schema reachable from `annotatedAllowedTypes`, applying the visitor pattern.
 * @remarks
 * Applies {@link SchemaVisitor.allowedTypeFilter} to root references as well as child references.
 * The root allowed-type callback runs after its selected node roots have been walked.
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
 * Traverses the schema graph reachable from node roots, applying the supplied visitor.
 * @param roots - Node roots to visit. The allowed-type filter applies to child references, not these explicit roots.
 * @param visitor - Callbacks and filtering for this walk, optionally including caller-owned knowledge of previous component visits.
 * @param visited - Schema identities excluded from discovery, updated as new nodes are discovered.
 * Entries added before an error are not rolled back; use a fresh set to retry a complete walk.
 * @remarks
 * Walks without a component callback allocate no component state.
 * Nodes already in `visited` are outside this walk's graph, which can split components.
 *
 * An {@link IncrementalSchemaVisitor} can omit component visits already completed by the caller.
 * Ordinary {@link SchemaVisitor}s report every visited component when requested, independently of caller-owned results.
 * The walker retains no internal state between calls. Failed walks discard unfinished component analysis;
 * results from successfully completed component callbacks remain the caller's responsibility.
 *
 * @privateRemarks
 * TreeNodeSchema references form a directed graph, which may contain cycles.
 * To handle this, we use Tarjan's strongly connected components algorithm.
 * See https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm.
 *
 * The strongly connected components are passed to {@link SchemaVisitor.stronglyConnectedComponent},
 * but also used to more generally handle the cycles and ensure we visit each node exactly once.
 * There are simpler ways to visit each node exactly once, but there are some use-cases of this traversal
 * that benefit from knowing the strongly connected components explicitly, so that analysis is included here.
 */
export function walkSchema(
	roots: Iterable<TreeNodeSchema>,
	visitor: SchemaVisitor | IncrementalSchemaVisitor,
	visited: Set<TreeNodeSchema> = new Set(),
): void {
	const { wasComponentVisited, allowedTypeFilter } = visitor;
	assert(
		wasComponentVisited === undefined ||
			(visitor.stronglyConnectedComponent !== undefined && visitor.node === undefined),
		"Incremental component visits require a component callback without node callbacks",
	);
	/**
	 * Zero-based ordinal assigned when a node enters this walk's component analysis.
	 * Smaller values identify earlier discoveries.
	 * Local to one walk; not a schema identifier or an index into the traversal stack.
	 */
	type DiscoveryIndex = number;

	/**
	 * Temporary Tarjan state for a node not covered by a previous component visit.
	 */
	interface ComponentState {
		/**
		 * Identity of the node, independent of its schema identifier.
		 */
		readonly schema: TreeNodeSchema;
		/**
		 * This node's {@link DiscoveryIndex}.
		 */
		readonly index: DiscoveryIndex;
		/**
		 * Lowest {@link DiscoveryIndex} propagated from depth-first-search children or edges to unfinished nodes.
		 */
		lowLink: DiscoveryIndex;
		/**
		 * Whether this node still belongs to an unfinished component.
		 * Can remain true after its traversal frame has finished.
		 */
		onStack: boolean;
	}
	/**
	 * A suspended node visit, retaining its reference iterator until its children have been walked.
	 */
	interface Frame {
		/**
		 * Node whose fields are being visited.
		 */
		readonly schema: TreeNodeSchema;
		/**
		 * Remaining selected references; resuming the iterator also completes allowed-type callbacks.
		 */
		readonly references: Iterator<TreeNodeSchema>;
		/**
		 * Absent for ordinary walks without component callbacks and for previously visited components.
		 */
		readonly componentState: ComponentState | undefined;
	}
	/**
	 * Per-walk component bookkeeping, separate from the caller's knowledge of previous component visits.
	 */
	interface ComponentAnalysis {
		/**
		 * Visitor callback invoked when a component completes.
		 */
		readonly completed: NonNullable<SchemaVisitor["stronglyConnectedComponent"]>;
		/**
		 * Discovered nodes participating in this walk's component analysis, including completed components.
		 * Excludes nodes covered by the caller's previous component visits.
		 */
		readonly states: Map<TreeNodeSchema, ComponentState>;
		/**
		 * Nodes in unfinished components, in discovery order.
		 * Unlike the traversal frame stack, retains nodes whose fields have finished until their component completes.
		 */
		readonly stack: ComponentState[];
	}
	const analysis: ComponentAnalysis | undefined =
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
			? {
					allowedTypeFilter: (type) =>
						(allowedTypeFilter === undefined || allowedTypeFilter(type)) &&
						!wasComponentVisited(type.type),
				}
			: visitor;

	/**
	 * Evaluates fields in declaration order without initializing contexts.
	 * Preserves complete allowed-type lists for field callbacks while filtering yielded references.
	 */
	function* references(schema: TreeNodeSchema): IterableIterator<TreeNodeSchema> {
		// Do not initialize contexts: this walk is itself used during node initialization.
		for (const field of getTreeNodeSchemaPrivateData(schema).childAllowedTypes) {
			const types = normalizeAndEvaluateAnnotatedAllowedTypes(field);
			// Preserve the full annotation sequence, but prune previously visited components before yielding.
			yield* visitAllowedTypes(types, referenceVisitor);
		}
	}

	/**
	 * Starts an unvisited node unless its previous component visit permits pruning.
	 * When field callbacks require traversal, most-derived validation precedes querying previous component visits.
	 */
	function discover(schema: TreeNodeSchema): void {
		if (visited.has(schema)) {
			return;
		}
		visited.add(schema);
		// Previously visited components need no new component state, but field callbacks still require traversal.
		if (pruneVisitedComponents && wasComponentVisited(schema)) {
			return;
		}
		// Reject conflicting subclasses of a factory-generated base, including conflicts with constructed nodes.
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

	/**
	 * Reports a component when its earliest-discovered member finishes, then propagates the low-link value to its parent.
	 * Called after the node callback and after removing the node's traversal frame.
	 */
	function finishComponentFrame(
		componentAnalysis: ComponentAnalysis,
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

/**
 * Yields selected references, then reports the full evaluated allowed-type list.
 * The traversal driver walks each yielded reference before requesting the next one.
 */
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
	 * @remarks
	 * Inner nodes are reported first so errors in dependencies can be addressed before schemas that refer to them.
	 * Cycles prevent a strict dependency order between individual nodes; use component callbacks when that order is required.
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
	 * Called after each encountered allowed-type list has been walked.
	 * @remarks
	 * This includes every field, as well as the allowed types for maps and arrays nodes and the root if starting at {@link walkAllowedTypes}.
	 *
	 * Receives the full normalized, evaluated list, including entries rejected by the filter and duplicate entries.
	 * A list reused by multiple fields is reported for each field occurrence.
	 *
	 * Called after walking the allowed types selected by {@link SchemaVisitor.allowedTypeFilter}.
	 */
	allowedTypes?: (allowedTypes: AllowedTypesFullEvaluated) => void;
	/**
	 * Selects whether to follow this allowed-type reference.
	 *
	 * If omitted, all references are included.
	 * @remarks
	 * Called before walking each reference, including references to already visited nodes.
	 * @privateRemarks
	 * It would be possible to combine this with `allowedTypes` into a single callback, but for the current usage this separation is more convenient.
	 */
	allowedTypeFilter?: (allowedType: AnnotatedAllowedType<TreeNodeSchema>) => boolean;
}

/**
 * A visitor for incrementally visiting components of a schema graph with {@link walkSchema}.
 * @remarks
 * Reuses {@link SchemaVisitor}'s component, allowed-type, and filtering callbacks.
 * Unlike an ordinary visitor, it reports only components not covered by {@link IncrementalSchemaVisitor.wasComponentVisited}.
 * Outgoing dependency components have either completed their callback in this walk or are covered by that predicate.
 *
 * Use this when component callbacks produce reusable caller-owned results, while allowed-type callbacks perform
 * checks required on every pass, such as configuration-specific validation.
 * No cache is maintained by the walker, and retaining cached results is not required by this interface.
 * Node callbacks are excluded: this mode omits previously completed component visits.
 * Neither the callbacks nor the predicate may initialize node contexts during schema discovery.
 */
export interface IncrementalSchemaVisitor
	extends Pick<SchemaVisitor, "allowedTypes" | "allowedTypeFilter">,
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
	 * Previous visits must describe the same graph selected by {@link SchemaVisitor.allowedTypeFilter},
	 * including the same filtering decisions and compatible visited-set boundaries.
	 * Filter function identity alone is insufficient if its captured state changes.
	 * Dependencies excluded by the filter do not need completed visits.
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
}
