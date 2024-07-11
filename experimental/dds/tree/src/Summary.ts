/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from '@fluidframework/core-interfaces';
import { IFluidSerializer, serializeHandles } from '@fluidframework/shared-object-base/internal';

import { fail } from './Common.js';
import type { EditHandle } from './EditLog.js';
import type { MutableStringInterner } from './StringInterner.js';
import type { IdCompressor } from './id-compressor/index.js';
import type { ChangeInternal, ChangeNode, EditLogSummary, SharedTreeSummaryBase } from './persisted-types/index.js';

/**
 * The contents of a SharedTree summary, converted to a common internal format that can be
 * loaded into a SharedTree.
 * @internal
 */
export interface SummaryContents {
	readonly currentTree?: ChangeNode;

	/**
	 * Information that can populate an edit log.
	 */
	readonly editHistory: EditLogSummary<ChangeInternal, EditHandle<ChangeInternal>>;

	/**
	 * Information about all IDs compressed in the summary
	 */
	readonly idCompressor: IdCompressor;

	/**
	 * Interner pre-loaded with all definitions and labels from the summary.
	 */
	readonly interner: MutableStringInterner;
}

/**
 * Serializes a SharedTree summary into a JSON string. This may later be used to initialize a SharedTree's state via `deserialize()`
 * Also replaces handle objects with their serialized form.
 *
 * @param summary - The SharedTree summary to serialize.
 * @param serializer - The serializer required to serialize handles in the summary.
 * @param bind - The object handle required to serialize handles in the summary
 */
export function serialize(summary: SharedTreeSummaryBase, serializer: IFluidSerializer, bind: IFluidHandle): string {
	return serializeHandles(summary, serializer, bind) ?? fail();
}
