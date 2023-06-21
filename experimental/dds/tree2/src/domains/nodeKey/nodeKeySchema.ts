/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GlobalFieldKey, TreeSchemaIdentifier } from "../../core";
import {
	SchemaLibrary,
	GlobalFieldSchema,
	NodeKeyFieldKind,
	buildNodeKeySchema,
} from "../../feature-libraries";
import { brand } from "../../util";

/**
 * The key for the special field for node keys,
 * which allows nodes to be given keys that can be used to find the nodes via the node key index.
 * @alpha
 * @privateRemarks TODO: Come up with a unified and collision-resistant naming schema for global fields defined by the system.
 * For now, we'll use `__` to reduce the change of collision, since this is what other internal properties use in Fluid.
 */
export const nodeKeyFieldKey: GlobalFieldKey = brand("__n_id__");

const schema = buildNodeKeySchema(nodeKeyFieldKey);

/**
 * Get the schema for working with {@link LocalNodeKey}s in a shared tree.
 * Node keys are added to nodes via a global field.
 * @returns the type of node key nodes in the schema,
 * the schema for the global field under which node keys reside,
 * and a schema library containing the above.
 * @alpha
 */
export function nodeKeySchema(): {
	schema: SchemaLibrary;
	field: GlobalFieldSchema<NodeKeyFieldKind>;
	type: TreeSchemaIdentifier;
} {
	return schema;
}
