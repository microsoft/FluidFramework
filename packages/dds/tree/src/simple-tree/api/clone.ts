/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import type { IFluidHandle } from "@fluidframework/core-interfaces";

// import type { JsonCompatible } from "../../util/index.js";
// import type {
// 	TreeLeafValue,
// 	ImplicitFieldSchema,
// 	TreeFieldFromImplicitField,
// } from "../schemaTypes.js";
// import type { TreeNode } from "../core/index.js";
// import type { VerboseTree, VerboseTreeNode } from "./verboseTree.js";

// /**
//  * Like {@link Tree.create}, except deeply clones existing nodes.
//  * @remarks
//  * This only clones the persisted data associated with a node.
//  * Local state, such as properties added to customized schema classes, will not be cloned:
//  * they will be initialized however they end up after running the constructor, just like if a remote client had inserted the same nodes.
//  */
// export function clone<TSchema extends ImplicitFieldSchema>(
// 	original: TreeFieldFromImplicitField<TSchema>,
// 	options?: {
// 		/**
// 		 * If set, all identifier's in the cloned tree (See {@link SchemaFactory.identifier}) will be replaced with new ones allocated using the default identifier allocation schema.
// 		 * Otherwise any identifiers will be preserved as is.
// 		 */
// 		replaceIdentifiers?: true;
// 	},
// ): TreeFieldFromImplicitField<TSchema> {
// 	throw new Error();
// }

// /**
//  * Copy a snapshot of the current version of a TreeNode into a JSON compatible plain old JavaScript Object.
//  *
//  * @remarks
//  * If the schema is compatible with {@link ITreeConfigurationOptions.preventAmbiguity}, then the returned object will be lossless and compatible with {@link Tree.create} (unless the options are used to customize it).
//  */
// export function cloneToJSON<T>(
// 	node: TreeNode,
// 	options?: {
// 		handleConverter(handle: IFluidHandle): T;
// 		readonly useStableFieldKeys?: boolean;
// 	},
// ): JsonCompatible<T>;

// /**
//  * Same as generic overload, except leaves handles as is.
//  */
// export function cloneToJSON(
// 	node: TreeNode,
// 	options?: { handleConverter?: undefined; useStableFieldKeys?: boolean },
// ): JsonCompatible<IFluidHandle>;

// export function cloneToJSON<T>(
// 	node: TreeNode,
// 	options?: {
// 		handleConverter?(handle: IFluidHandle): T;
// 		readonly useStableFieldKeys?: boolean;
// 	},
// ): JsonCompatible<T> {
// 	throw new Error();
// }

// /**
//  * Copy a snapshot of the current version of a TreeNode into a JSON compatible plain old JavaScript Object.
//  * Verbose tree format, with explicit type on every node.
//  *
//  * @remarks
//  * There are several cases this may be preferred to {@link Tree.clone}:
//  *
//  * 1. When not using {@link ITreeConfigurationOptions.preventAmbiguity} (or when using `useStableFieldKeys`), {@link Tree.clone} can produce ambiguous data (the type may be unclear on some nodes).
//  * This may be a good alternative to {@link Tree.clone} since it is lossless.
//  *
//  * 2. When the data might be interpreted without access to the exact same view schema. In such cases, the types may be unknowable if not included.
//  *
//  * 3. When easy access to the type is desired, or a more uniform simple to parse format is desired.
//  */
// export function cloneToJSONVerbose<T>(
// 	node: TreeNode,
// 	options?: {
// 		handleConverter(handle: IFluidHandle): T;
// 		readonly useStableFieldKeys?: boolean;
// 	},
// ): VerboseTreeNode<T>;

// /**
//  * Same as generic overload, except leaves handles as is.
//  */
// export function cloneToJSONVerbose(
// 	node: TreeNode,
// 	options?: { readonly handleConverter?: undefined; readonly useStableFieldKeys?: boolean },
// ): VerboseTreeNode;

// export function cloneToJSONVerbose<T>(
// 	node: TreeNode,
// 	options?: {
// 		handleConverter?(handle: IFluidHandle): T;
// 		readonly useStableFieldKeys?: boolean;
// 	},
// ): VerboseTreeNode<T> {
// 	const config = {
// 		handleConverter(handle: IFluidHandle): T {
// 			return handle as T;
// 		},
// 		useStableFieldKeys: false,
// 		...options,
// 	};

// 	// TODO: this should probably just get a cursor to the underlying data and use that.

// 	function convertNode(n: TreeNode): VerboseTreeNode<T> {
// 		let fields: VerboseTreeNode<T>["fields"];

// 		if (n instanceof CustomArrayNodeBase) {
// 			const x = n as CustomArrayNodeBase<ImplicitAllowedTypes>;
// 			fields = Array.from(x, convertNodeOrValue);
// 		} else if ((n as TreeNode) instanceof CustomMapNodeBase) {
// 			fields = {};
// 			for (const [key, value] of n as CustomMapNodeBase<ImplicitAllowedTypes>) {
// 				fields[key] = convertNodeOrValue(value);
// 			}
// 		} else {
// 			fields = {};
// 			for (const [key, value] of n as CustomMapNodeBase<ImplicitAllowedTypes>) {
// 				fields[key] = convertNodeOrValue(value);
// 			}
// 		}

// 		return { type: n[typeNameSymbol], fields };
// 	}

// 	function convertNodeOrValue(n: TreeNode | TreeLeafValue): VerboseTree<T> {
// 		return isTreeNode(n) ? convertNode(n) : isFluidHandle(n) ? config.handleConverter(n) : n;
// 	}

// 	return convertNode(node);
// }
