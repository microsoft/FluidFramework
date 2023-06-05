/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GlobalFieldKey, TreeSchemaIdentifier } from "../../core";
import {
	SchemaLibrary,
	GlobalFieldSchema,
	NodeIdentifierFieldKind,
	buildNodeIdentifierSchema as keyedNodeIdentifierSchema,
} from "../../feature-libraries";
import { brand } from "../../util";

/**
 * The key for the special node identifier field,
 * which allows nodes to be given identifiers that can be used to find the nodes via the node identifier index.
 * @alpha
 * @privateRemarks TODO: Come up with a unified and collision-resistant naming schema for global fields defined by the system.
 * For now, we'll use `__` to reduce the change of collision, since this is what other internal properties use in Fluid.
 */
export const nodeIdentifierKey: GlobalFieldKey = brand("__n_id__");

const schema = keyedNodeIdentifierSchema(nodeIdentifierKey);

/**
 * Get the schema for working with {@link NodeIdentifier}s in a shared tree.
 * Node identifiers are added to nodes via a global field.
 * @returns the identifier/type of identifier nodes in the schema,
 * the schema for the global field under which identifiers reside,
 * and a schema library containing the above.
 * @alpha
 */
export function nodeIdentifierSchema(): {
	schema: SchemaLibrary;
	field: GlobalFieldSchema<NodeIdentifierFieldKind>;
	type: TreeSchemaIdentifier;
} {
	return schema;
}
