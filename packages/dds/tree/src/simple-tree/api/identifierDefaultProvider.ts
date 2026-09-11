/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import type { FlexTreeHydratedContextMinimal } from "../../feature-libraries/index.js";
import type { UnhydratedFlexTreeNode } from "../core/index.js";
import { type DefaultProvider, getDefaultProvider } from "../fieldSchema.js";
import { stringSchema } from "../leafNodeSchema.js";
import { unhydratedFlexTreeFromInsertable } from "../unhydratedFlexTreeFromInsertable.js";

/**
 * Used to allocate default identifiers for unhydrated nodes when no context is available.
 * @remarks
 * The identifiers allocated by this will never be compressed to Short Ids.
 * Using this is only better than creating fully random V4 UUIDs because it reduces the entropy making it possible for things like text compression to work slightly better.
 */
const globalIdentifierAllocator: IIdCompressor = createIdCompressor();

/**
 * Provides identifiers using the tree's identifier compressor when available, or a global allocator otherwise.
 */
export const defaultIdentifierProvider: DefaultProvider = getDefaultProvider(
	(context: FlexTreeHydratedContextMinimal | "UseGlobalContext"): UnhydratedFlexTreeNode[] => {
		const id =
			context === "UseGlobalContext"
				? globalIdentifierAllocator.decompress(
						globalIdentifierAllocator.generateCompressedId(),
					)
				: context.nodeKeyManager.stabilizeNodeIdentifier(
						context.nodeKeyManager.generateLocalNodeIdentifier(),
					);

		return [unhydratedFlexTreeFromInsertable(id, stringSchema)];
	},
);
