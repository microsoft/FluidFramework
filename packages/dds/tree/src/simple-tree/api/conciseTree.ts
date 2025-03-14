/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";

import type { ITreeCursor } from "../../core/index.js";
import type { TreeLeafValue, ImplicitAllowedTypes } from "../schemaTypes.js";
import type { TreeNodeSchema } from "../core/index.js";
import {
	customFromCursor,
	replaceHandles,
	type EncodeOptions,
	type HandleConverter,
} from "./customTree.js";
import { getUnhydratedContext } from "../createContext.js";

/**
 * Concise encoding of a {@link TreeNode} or {@link TreeLeafValue}.
 * @remarks
 * This is "concise" meaning that explicit type information is omitted.
 * If the schema is compatible with {@link ITreeConfigurationOptions.preventAmbiguity},
 * types will be lossless and compatible with {@link TreeAlpha.create} (unless the options are used to customize it).
 *
 * Every {@link TreeNode} is an array or object.
 * Any IFluidHandle values have been replaced by `THandle`.
 * @privateRemarks
 * This can store all possible simple trees,
 * but it can not store all possible trees representable by our internal representations like FlexTree and JsonableTree.
 * @alpha
 */
export type ConciseTree<THandle = IFluidHandle> =
	| Exclude<TreeLeafValue, IFluidHandle>
	| THandle
	| ConciseTree<THandle>[]
	| {
			[key: string]: ConciseTree<THandle>;
	  };

/**
 * Used to read a node cursor as a ConciseTree.
 */
export function conciseFromCursor(
	reader: ITreeCursor,
	rootSchema: ImplicitAllowedTypes,
	options: EncodeOptions,
): ConciseTree {
	const config: Required<EncodeOptions> = {
		useStoredKeys: false,
		...options,
	};

	const schemaMap = getUnhydratedContext(rootSchema).schema;
	return conciseFromCursorInner(reader, config, schemaMap);
}

function conciseFromCursorInner(
	reader: ITreeCursor,
	options: Required<EncodeOptions>,
	schema: ReadonlyMap<string, TreeNodeSchema>,
): ConciseTree {
	return customFromCursor(reader, options, schema, conciseFromCursorInner);
}

/**
 * Clones tree, replacing any handles.
 * A strongly types version of {@link replaceHandles}.
 * @alpha
 */
export function replaceConciseTreeHandles<T>(
	tree: ConciseTree,
	replacer: HandleConverter<T>,
): ConciseTree<T> {
	return replaceHandles(tree, replacer) as ConciseTree<T>;
}
