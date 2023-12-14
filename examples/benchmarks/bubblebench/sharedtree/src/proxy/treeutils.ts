/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Definition, ChangeNode, NodeIdContext } from "@fluid-experimental/tree";
import { Serializable } from "@fluidframework/datastore-definitions";

export const enum NodeKind {
	scalar = "s",
	object = "o",
	array = "a",
}

// Helper for creating Scalar nodes in SharedTree
export const makeScalar = (
	idContext: NodeIdContext,
	value: Exclude<Serializable<unknown>, object>,
): ChangeNode => ({
	identifier: idContext.generateNodeId(),
	definition: NodeKind.scalar as Definition,
	traits: {},
	payload: value,
});

export function fromJson<T>(idContext: NodeIdContext, value: Serializable<T>): ChangeNode {
	if (typeof value === "object") {
		if (Array.isArray(value)) {
			return {
				identifier: idContext.generateNodeId(),
				definition: NodeKind.array as Definition,
				traits: {
					items: value.map((property): ChangeNode => fromJson(idContext, property)),
				},
			};
		} else if (value === null) {
			return makeScalar(idContext, null);
		} else {
			const traits: PropertyDescriptorMap = {};

			for (const [label, json] of Object.entries(value)) {
				traits[label] = { value: [fromJson(idContext, json)], enumerable: true };
			}

			const node: ChangeNode = {
				identifier: idContext.generateNodeId(),
				definition: NodeKind.object as Definition,
				traits: Object.defineProperties({}, traits),
			};

			return node;
		}
	} else {
		return makeScalar(idContext, value);
	}
}
