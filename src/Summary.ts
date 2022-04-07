/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from '@fluidframework/core-interfaces';
import { IFluidSerializer, serializeHandles } from '@fluidframework/shared-object-base';
import { fail } from './Common';
import type { IdCompressor } from './id-compressor';
import type { EditLogSummary, SharedTreeSummaryBase, ChangeNode, ChangeInternal } from './persisted-types';
import type { EditHandle } from './EditLog';

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
