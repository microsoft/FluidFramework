/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";

import { fail, type JsonCompatible } from "../../util/index.js";
import type {
	ImplicitFieldSchema,
	TreeFieldFromImplicitField,
	TreeLeafValue,
} from "../schemaTypes.js";
import { getKernel, type TreeNode } from "../core/index.js";
import { verboseFromCursor, type EncodeOptions, type VerboseTree } from "./verboseTree.js";
import type { ITreeCursorSynchronous } from "../../core/index.js";
import { cursorFromInsertable } from "./create.js";
import { tryGetSchema } from "./treeNodeApi.js";
import {
	cursorForMapTreeField,
	defaultSchemaPolicy,
	isTreeValue,
	makeFieldBatchCodec,
	mapTreeFromCursor,
	TreeCompressionStrategy,
	type FieldBatch,
	type FieldBatchEncodingContext,
} from "../../feature-libraries/index.js";
import { noopValidator, type FluidClientVersion } from "../../codec/index.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/internal"; // TODO: no alpha exports?
import { toStoredSchema } from "../toFlexSchema.js";
import { conciseFromCursor, type ConciseTree } from "./conciseTree.js";

/**
 * Like {@link TreeBeta.create}, except deeply clones existing nodes.
 * @remarks
 * This only clones the persisted data associated with a node.
 * Local state, such as properties added to customized schema classes, will not be cloned:
 * they will be initialized however they end up after running the constructor, just like if a remote client had inserted the same nodes.
 * @beta
 */
export function clone<TSchema extends ImplicitFieldSchema>(
	original: TreeFieldFromImplicitField<TSchema>,
	options?: {
		/**
		 * If set, all identifier's in the cloned tree (See {@link SchemaFactory.identifier}) will be replaced with new ones allocated using the default identifier allocation schema.
		 * Otherwise any identifiers will be preserved as is.
		 */
		replaceIdentifiers?: true;
	},
): TreeFieldFromImplicitField<TSchema> {
	throw new Error();
}

/**
 * Copy a snapshot of the current version of a TreeNode into a {@link ConciseTree}.
 * @beta
 */
export function exportConcise<T>(
	node: TreeNode | TreeLeafValue,
	options?: {
		handleConverter(handle: IFluidHandle): T;
		readonly useStableFieldKeys?: boolean;
	},
): ConciseTree<T>;

/**
 * Same as generic overload, except leaves handles as is.
 * @beta
 */
export function exportConcise(
	node: TreeNode | TreeLeafValue,
	options?: { handleConverter?: undefined; useStableFieldKeys?: boolean },
): JsonCompatible<IFluidHandle>;

export function exportConcise<T>(
	node: TreeNode | TreeLeafValue,
	options?: {
		handleConverter?(handle: IFluidHandle): T;
		readonly useStableFieldKeys?: boolean;
	},
): JsonCompatible<T> {
	const config: EncodeOptions<T> = {
		valueConverter(handle: IFluidHandle): T {
			return handle as T;
		},
		...options,
	};

	const cursor = borrowCursorFromTreeNodeOrValue(node);
	return conciseFromCursor(cursor, tryGetSchema(node) ?? fail("invalid input"), config);
}

function borrowCursorFromTreeNodeOrValue(
	node: TreeNode | TreeLeafValue,
): ITreeCursorSynchronous {
	if (isTreeValue(node)) {
		return cursorFromInsertable(tryGetSchema(node) ?? fail("missing schema"), node);
	}
	const kernel = getKernel(node);
	const cursor = kernel.getOrCreateInnerNode().borrowCursor();
	return cursor;
}

function borrowFieldCursorFromTreeNodeOrValue(
	node: TreeNode | TreeLeafValue,
): ITreeCursorSynchronous {
	const cursor = borrowCursorFromTreeNodeOrValue(node);
	// TODO: avoid copy
	const mapTree = mapTreeFromCursor(cursor);
	return cursorForMapTreeField([mapTree]);
}

/**
 * Copy a snapshot of the current version of a TreeNode into a JSON compatible plain old JavaScript Object.
 * Verbose tree format, with explicit type on every node.
 *
 * @remarks
 * There are several cases this may be preferred to {@link TreeBeta.exportConcise}:
 *
 * 1. When not using {@link ITreeConfigurationOptions.preventAmbiguity} (or when using `useStableFieldKeys`), {@link TreeBeta.clone} can produce ambiguous data (the type may be unclear on some nodes).
 * This may be a good alternative to {@link TreeBeta.clone} since it is lossless.
 *
 * 2. When the data might be interpreted without access to the exact same view schema. In such cases, the types may be unknowable if not included.
 *
 * 3. When easy access to the type is desired, or a more uniform simple to parse format is desired.
 * @beta
 */
export function exportVerbose<T>(
	node: TreeNode | TreeLeafValue,
	options: EncodeOptions<T>,
): VerboseTree<T>;

/**
 * Same as generic overload, except leaves handles as is.
 * @beta
 */
export function exportVerbose(
	node: TreeNode | TreeLeafValue,
	options?: Partial<EncodeOptions<IFluidHandle>>,
): VerboseTree;

export function exportVerbose<T>(
	node: TreeNode | TreeLeafValue,
	options?: Partial<EncodeOptions<T>>,
): VerboseTree<T> {
	const config: EncodeOptions<T> = {
		valueConverter(handle: IFluidHandle): T {
			return handle as T;
		},
		...options,
	};

	const cursor = borrowCursorFromTreeNodeOrValue(node);
	return verboseFromCursor(cursor, tryGetSchema(node) ?? fail("invalid input"), config);
}

/**
 * Construct tree content compatible with a field defined by the provided `schema`.
 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
 * @param data - The data used to construct the field content. See `Tree.cloneToVerbose`.
 * @beta
 */
export function exportCompressed(
	node: TreeNode | TreeLeafValue,
	options: { oldestCompatibleClient: FluidClientVersion; idCompressor?: IIdCompressor },
): JsonCompatible<IFluidHandle> {
	const schema = tryGetSchema(node) ?? fail("invalid input");
	const format = versionToFormat[options.oldestCompatibleClient];
	const codec = makeFieldBatchCodec({ jsonValidator: noopValidator }, format);
	const cursor = borrowFieldCursorFromTreeNodeOrValue(node);
	const batch: FieldBatch = [cursor];
	// If none provided, create a compressor which will not compress anything (TODO: is this the right way to do that?).
	const idCompressor = options.idCompressor ?? createIdCompressor();
	const context: FieldBatchEncodingContext = {
		encodeType: TreeCompressionStrategy.Compressed,
		idCompressor,
		originatorId: idCompressor.localSessionId, // Is this right? If so, why is is needed?
		schema: { schema: toStoredSchema(schema), policy: defaultSchemaPolicy },
	};
	const result = codec.encode(batch, context);
	return result;
}

const versionToFormat = {
	v2_0: 1,
	v2_1: 1,
	v2_2: 1,
	v2_3: 1,
};
