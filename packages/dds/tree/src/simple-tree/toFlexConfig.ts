/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../util/index.js";
import type { ITreeCursorSynchronous } from "../core/index.js";
import type { TreeContent } from "../shared-tree/index.js";
import { type InsertableContent, extractFactoryContent } from "./proxies.js";
import { cursorFromNodeData } from "./toMapTree.js";
import {
	FieldSchema,
	type ImplicitFieldSchema,
	type InsertableTreeNodeFromImplicitAllowedTypes,
} from "./schemaTypes.js";
import { TreeConfiguration } from "./tree.js";
import { toFlexSchema } from "./toFlexSchema.js";

/**
 * Returns a cursor (in nodes mode) for the root node.
 *
 * @privateRemarks
 * Ideally this would work on any node, not just the root,
 * and the schema would come from the unhydrated node.
 * For now though, this is the only case that's needed, and we do have the data to make it work, so this is fine.
 */
export function cursorFromUnhydratedRoot(
	rootSchema: ImplicitFieldSchema,
	tree: InsertableTreeNodeFromImplicitAllowedTypes,
): ITreeCursorSynchronous {
	const data = extractFactoryContent(tree as InsertableContent);
	const allowedTypes = rootSchema instanceof FieldSchema ? rootSchema.allowedTypes : rootSchema;
	return cursorFromNodeData(data.content, allowedTypes) ?? fail("failed to decode tree");
}

export function toFlexConfig(config: TreeConfiguration): TreeContent {
	const schema: ImplicitFieldSchema = config.schema;
	const flexSchema = toFlexSchema(schema);
	const unhydrated = config.initialTree();
	const initialTree =
		unhydrated === undefined ? undefined : [cursorFromUnhydratedRoot(schema, unhydrated)];
	return {
		schema: flexSchema,
		initialTree,
	};
}
