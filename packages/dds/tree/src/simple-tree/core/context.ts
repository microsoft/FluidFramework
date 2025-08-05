/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNodeSchemaIdentifier } from "../../core/index.js";
import type {
	FlexTreeContext,
	FlexTreeHydratedContext,
} from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import type { NormalizedAnnotatedAllowedTypes } from "./allowedTypes.js";

import type { TreeNodeSchema } from "./treeNodeSchema.js";
import { walkAllowedTypes } from "./walkSchema.js";

/**
 * Additional information about a collection of {@link TreeNode}s.
 * @remarks
 * Each TreeNode provides a way to navigate to a context for it with additional information.
 *
 * For unhydrated nodes, this information is rather limited since the node doesn't know what tree it might get inserted into (if any),
 * and thus is limited to information derived about that particular unhydrated tree and its schema.
 *
 * Hydrated nodes have more contextual information, and thus can provide a single {@link HydratedContext} for all nodes in the document which can have additional information.
 *
 * @privateRemarks
 * This design is the same as {@link FlexTreeContext} with its base type and {@link FlexTreeHydratedContext} extending it.
 */
export class Context {
	public static schemaMapFromRootSchema(
		rootSchema: NormalizedAnnotatedAllowedTypes,
	): ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeSchema> {
		const schema: Map<TreeNodeSchemaIdentifier, TreeNodeSchema> = new Map();
		walkAllowedTypes(rootSchema, {
			node(nodeSchema) {
				schema.set(brand(nodeSchema.identifier), nodeSchema);
			},
		});
		return schema;
	}

	/**
	 * Builds the context.
	 * @remarks
	 * Since this walks the schema, it must not be invoked during schema declaration or schema forward references could fail to be resolved.
	 */
	public constructor(
		public readonly flexContext: FlexTreeContext,
		/**
		 * All schema which could transitively be used under the associated node.
		 * @remarks
		 * While generally {@link TreeNodeSchema} are referenced as objects and thus do not need to be looked up by identifier,
		 * there are a few cases (mainly constructing new TreeNodes from existing tree data) where such a lookup is useful.
		 * Having this map in the context addresses this use-case.
		 * @privateRemarks
		 * This design mirrors how {@link FlexTreeSchema} are accessed off the {@link FlexTreeContext}, making the migration away from them simpler.
		 */
		public readonly schema: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeSchema>,
	) {}
}

/**
 * Extends {@link Context} with additional information from the view and/or tree which becomes known when a {@link TreeNode} is hydrated,
 * associating it with the containing {@link TreeView}.
 */
export class HydratedContext extends Context {
	public constructor(
		public override readonly flexContext: FlexTreeHydratedContext,
		schema: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeSchema>,
	) {
		super(flexContext, schema);
	}
}
