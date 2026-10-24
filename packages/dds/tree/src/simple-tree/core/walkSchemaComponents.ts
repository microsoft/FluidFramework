/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { AllowedTypesFullEvaluated } from "./allowedTypes.js";
import type { TreeNodeSchema } from "./treeNodeSchema.js";
import { walkNodeSchema, type SchemaVisitor } from "./walkSchema.js";

/**
 * A discovered schema and its evaluated fields, retaining duplicate allowed-type entries.
 */
export interface SchemaComponentMember {
	readonly schema: TreeNodeSchema;
	readonly fields: readonly AllowedTypesFullEvaluated[];
}

/**
 * Completes unfiltered strongly connected components in dependency order using the shared iterative visitor walk.
 * @remarks
 * At `completed`, every member is discovered and all outgoing dependencies outside the component have completed.
 * `isComplete` must certify completed transitive topology, never in-progress analysis.
 * Staged references and non-class leaf schemas participate in the graph.
 *
 * When provided, `allowedTypes` visits every field in the original visitor order, including in cached components.
 * This permits per-request validation without recomputing completed analysis.
 * A failed walk discards unfinished components; completed dependencies can remain cached.
 * Neither this walk nor its callbacks may initialize contexts.
 */
export function walkSchemaComponents(
	roots: Iterable<TreeNodeSchema>,
	completed: (members: readonly SchemaComponentMember[]) => void,
	isComplete: (schema: TreeNodeSchema) => boolean = () => false,
	allowedTypes?: (types: AllowedTypesFullEvaluated) => void,
): void {
	interface State {
		readonly schema: TreeNodeSchema;
		readonly index: number;
		lowLink: number;
		onStack: boolean;
		readonly fields: AllowedTypesFullEvaluated[];
	}

	const states = new Map<TreeNodeSchema, State>();
	const stack: State[] = [];
	const active: (State | undefined)[] = [];
	const visitor: SchemaVisitor = {
		enterNode(schema) {
			const state: State | undefined = isComplete(schema)
				? undefined
				: { schema, index: states.size, lowLink: states.size, onStack: true, fields: [] };
			active.push(state);
			if (state !== undefined) {
				states.set(schema, state);
				stack.push(state);
			}
		},
		allowedTypeFilter({ type }) {
			const parent = active.at(-1);
			const child = states.get(type);
			if (parent !== undefined && child?.onStack === true) {
				parent.lowLink = Math.min(parent.lowLink, child.index);
			}
			return allowedTypes !== undefined || !isComplete(type);
		},
		allowedTypes(types) {
			active.at(-1)?.fields.push(types);
			allowedTypes?.(types);
		},
		node() {
			const current = active.pop();
			if (current === undefined) {
				return;
			}
			if (current.lowLink === current.index) {
				const members: SchemaComponentMember[] = [];
				let member: State;
				do {
					const popped = stack.pop();
					assert(popped !== undefined, "Expected a component member");
					member = popped;
					member.onStack = false;
					members.push({ schema: member.schema, fields: member.fields });
				} while (member !== current);
				completed(members);
			}
			const parent = active.at(-1);
			if (parent !== undefined) {
				parent.lowLink = Math.min(parent.lowLink, current.lowLink);
			}
		},
	};
	const visited = new Set<TreeNodeSchema>();
	for (const root of roots) {
		if (allowedTypes !== undefined || !isComplete(root)) {
			walkNodeSchema(root, visitor, visited);
		}
	}
}
