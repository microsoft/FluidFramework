/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { anchorSlot, type TreeNodeSchemaIdentifier } from "../../core/index.js";
import type {
	FlexTreeContext,
	FlexTreeHydratedContext,
} from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import type { TreeNodeSchema } from "./treeNodeSchema.js";
import { walkAllowedTypes } from "./walkSchema.js";

/**
 * Creating multiple simple tree contexts for the same branch, and thus with the same underlying AnchorSet does not work due to how TreeNode caching works.
 * This slot is used to detect if one already exists and error if creating a second.
 */
export const SimpleContextSlot = anchorSlot<HydratedContext>();

export class Context {
	public readonly schema: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeSchema>;
	public constructor(
		rootSchema: Iterable<TreeNodeSchema>,
		public readonly flexContext: FlexTreeContext,
	) {
		const schema: Map<TreeNodeSchemaIdentifier, TreeNodeSchema> = new Map();
		walkAllowedTypes(rootSchema, {
			node(nodeSchema) {
				schema.set(brand(nodeSchema.identifier), nodeSchema);
			},
		});
		this.schema = schema;
	}
}

export class HydratedContext extends Context {
	public constructor(
		rootSchema: Iterable<TreeNodeSchema>,
		public override readonly flexContext: FlexTreeHydratedContext,
	) {
		super(rootSchema, flexContext);
	}
}
