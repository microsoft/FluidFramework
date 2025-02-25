/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";

import type { ITreeCursor } from "../../core/index.js";
import type { TreeLeafValue, ImplicitAllowedTypes } from "../schemaTypes.js";
import type { TreeNodeSchema } from "../core/index.js";
import { customFromCursor, type EncodeOptions } from "./customTree.js";
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
export function conciseFromCursor<TCustom>(
	reader: ITreeCursor,
	rootSchema: ImplicitAllowedTypes,
	options: EncodeOptions<TCustom>,
): ConciseTree<TCustom> {
	const config: Required<EncodeOptions<TCustom>> = {
		useStoredKeys: false,
		...options,
	};

	const schemaMap = getUnhydratedContext(rootSchema).schema;
	return conciseFromCursorInner(reader, config, schemaMap);
}

function conciseFromCursorInner<TCustom>(
	reader: ITreeCursor,
	options: Required<EncodeOptions<TCustom>>,
	schema: ReadonlyMap<string, TreeNodeSchema>,
): ConciseTree<TCustom> {
	return customFromCursor(reader, options, schema, conciseFromCursorInner);
}
