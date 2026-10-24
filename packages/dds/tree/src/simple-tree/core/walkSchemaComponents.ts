/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { AllowedTypesFullEvaluated } from "./allowedTypes.js";
import type { TreeNodeSchema } from "./treeNodeSchema.js";
import { nodeSchemaFields } from "./walkSchema.js";

/**
 * A discovered schema and its evaluated fields, retaining duplicate allowed-type entries.
 */
export interface SchemaComponentMember {
	readonly schema: TreeNodeSchema;
	readonly fields: readonly AllowedTypesFullEvaluated[];
}

/**
 * Walks the unfiltered schema graph by identity, completing strongly connected components in dependency order.
 * @remarks
 * At `completed`, every member is discovered and all outgoing dependencies outside the component have completed.
 * `isComplete` may skip previously completed topology, but must never return true for in-progress analysis.
 * Staged references and non-class leaf schemas participate in the graph.
 *
 * Uses iterative Tarjan traversal: temporary storage and work are linear in newly discovered nodes and references.
 * A failed walk discards its unfinished components; already completed dependencies can remain cached.
 * Neither this walk nor its callbacks may initialize contexts.
 */
export function walkSchemaComponents(
	roots: Iterable<TreeNodeSchema>,
	completed: (members: readonly SchemaComponentMember[]) => void,
	isComplete: (schema: TreeNodeSchema) => boolean = () => false,
): void {
	interface State {
		readonly schema: TreeNodeSchema;
		readonly index: number;
		lowLink: number;
		onStack: boolean;
		readonly fields: AllowedTypesFullEvaluated[];
		readonly references: Iterator<TreeNodeSchema>;
	}

	const states = new Map<TreeNodeSchema, State>();
	const stack: State[] = [];
	const pending: State[] = [];

	function discover(schema: TreeNodeSchema): void {
		const fields: AllowedTypesFullEvaluated[] = [];
		function* references(): IterableIterator<TreeNodeSchema> {
			const referenced = new Set<TreeNodeSchema>();
			for (const field of nodeSchemaFields(schema)) {
				fields.push(field);
				for (const type of field.types) {
					if (!referenced.has(type.type)) {
						referenced.add(type.type);
						yield type.type;
					}
				}
			}
		}
		const state: State = {
			schema,
			index: states.size,
			lowLink: states.size,
			onStack: true,
			fields,
			references: references(),
		};
		states.set(schema, state);
		stack.push(state);
		pending.push(state);
	}

	for (const root of roots) {
		if (isComplete(root) || states.has(root)) {
			continue;
		}
		discover(root);
		while (pending.length > 0) {
			const current = pending.at(-1);
			assert(current !== undefined, "Expected an active schema");
			const next = current.references.next();
			if (next.done !== true) {
				const schema = next.value;
				if (isComplete(schema)) {
					continue;
				}
				const child = states.get(schema);
				if (child === undefined) {
					discover(schema);
				} else if (child.onStack) {
					current.lowLink = Math.min(current.lowLink, child.index);
				}
				continue;
			}

			pending.pop();
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
			const parent = pending.at(-1);
			if (parent !== undefined) {
				parent.lowLink = Math.min(parent.lowLink, current.lowLink);
			}
		}
	}
}
