/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from '@fluidframework/core-interfaces';
import { IFluidSerializer, serializeHandles } from '@fluidframework/shared-object-base';
import { assertNotUndefined } from './Common';
import type { EditHandle } from './EditLog';
import { EditLogSummary, SharedTreeSummaryBase, ChangeNode, WriteFormat } from './persisted-types';

/**
 * Format version for summaries that are written.
 * When next changing the format, we should add a new format version variable for the edit-specific summaries and assign it an independent
 * version number.
 */
export const formatVersion = WriteFormat.v0_0_2;

/**
 * The contents of a SharedTree summary, converted to a common internal format that can be
 * loaded into a SharedTree.
 * @internal
 */
export interface SummaryContents<TChange> {
	readonly currentTree?: ChangeNode;

	/**
	 * Information that can populate an edit log.
	 */
	readonly editHistory: EditLogSummary<TChange, EditHandle<TChange>>;
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
	return assertNotUndefined(serializeHandles(summary, serializer, bind));
}
