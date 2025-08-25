/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeKind, NodeSchemaMetadata } from "./treeNodeSchema.js";

/**
 * Base interface for {@link TreeNodeSchema} and {@link SimpleNodeSchema} types.
 * Once simple schema is stable this doesn't have a reason to be kept `@system`, but it could be.
 * @system
 * @public
 * @sealed
 */
export interface SimpleNodeSchemaBase<
	out TNodeKind extends NodeKind,
	out TCustomMetadata = unknown,
> {
	/**
	 * The {@link NodeKind}.
	 *
	 * @remarks can be used to type-switch between implementations.
	 */
	readonly kind: TNodeKind;

	/**
	 * User-provided {@link NodeSchemaMetadata} for this schema.
	 */
	readonly metadata: NodeSchemaMetadata<TCustomMetadata>;
}
