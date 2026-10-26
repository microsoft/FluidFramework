/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseProperties } from '@fluidframework/core-interfaces';
import type { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions/internal';
import type { ISummaryTreeWithStats } from '@fluidframework/runtime-definitions/internal';
import type { IFluidSerializer, ISharedObject } from '@fluidframework/shared-object-base/internal';
// eslint-disable-next-line import-x/no-internal-modules -- Preserve the existing logger contract.
import type { ITelemetryLoggerExt } from '@fluidframework/telemetry-utils/legacy';

import type { Change } from './ChangeTypes.js';
import type { OrderedEditSet } from './EditLog.js';
import type { AttributionId, EditId, NodeId, StableNodeId } from './Identifiers.js';
import type { LogViewer } from './LogViewer.js';
import type { NodeIdContext } from './NodeIdUtilities.js';
import type { RevisionView } from './RevisionView.js';
import type { ISharedTreeEvents } from './SharedTree.js';
import type {
	ChangeInternal,
	Edit,
	InternalizedChange,
	SharedTreeSummaryBase,
	WriteFormat,
} from './persisted-types/index.js';

/**
 * A distributed tree with transactional edits, stable node identities, and revision history.
 *
 * @remarks
 * Use `SharedTree.create(runtime)` or `SharedTree.getFactory()` to create an instance.
 * This interface describes the experimental tree, not `@fluidframework/tree`.
 *
 * @sealed
 * @alpha
 */
export interface ISharedTree extends ISharedObject<ISharedTreeEvents>, NodeIdContext {
	/**
	 * The attribution ID for nodes that this tree creates.
	 * Trees with write format 0.0.2 use the nil UUID.
	 */
	readonly attributionId: AttributionId;

	/**
	 * The view after all known edits, including local edits.
	 */
	readonly currentView: RevisionView;

	/**
	 * The ordered edit history, including local edits.
	 */
	readonly edits: OrderedEditSet<InternalizedChange>;

	/**
	 * The logger for tree events.
	 */
	readonly logger: ITelemetryLoggerExt;

	/**
	 * Access to revision views through the current and deprecated history methods.
	 */
	readonly logViewer: LogViewer;

	/**
	 * Applies changes to the most recent revision.
	 * Use {@link Checkout} for snapshot isolation.
	 * @param changes - The changes to apply.
	 * @returns The new edit.
	 */
	applyEdit(...changes: readonly Change[]): Edit<InternalizedChange>;

	/**
	 * Applies an array of changes to the most recent revision.
	 * @param changes - The changes to apply.
	 * @returns The new edit.
	 */
	applyEdit(changes: readonly Change[]): Edit<InternalizedChange>;

	/**
	 * Applies internal changes or an edit.
	 * Prefer `applyEdit` for application code.
	 * @param editOrChanges - The edit or internal changes to apply.
	 * @returns The applied edit.
	 */
	applyEditInternal(editOrChanges: Edit<ChangeInternal> | readonly ChangeInternal[]): Edit<ChangeInternal>;

	/**
	 * Gets the attribution ID of the tree that generated a node ID.
	 * @param id - The node ID to inspect.
	 * @returns The attribution ID, or the nil UUID for write format 0.0.2.
	 */
	attributeNodeId(id: NodeId): AttributionId;

	/**
	 * Compares semantic views and ordered edit IDs, independent of local or sequenced status.
	 * Use this method for correctness tests.
	 * @param sharedTree - The tree to compare.
	 * @returns Whether the trees have equal views and edit IDs.
	 */
	equals(sharedTree: ISharedTree): boolean;

	/**
	 * Gets the runtime that owns this tree.
	 * @returns The data store runtime.
	 */
	getRuntime(): IFluidDataStoreRuntime;

	/**
	 * Gets the current write format, which can upgrade during collaboration or summary load.
	 * @returns The current write format.
	 */
	getWriteFormat(): WriteFormat;

	/**
	 * Converts a public change to its internal representation.
	 * @param change - The change to convert.
	 * @returns The internal change.
	 */
	internalizeChange(change: Change): ChangeInternal;

	/**
	 * Loads a serialized summary before local state exists.
	 * @param blobData - The serialized summary.
	 * @returns Statistics about the loaded summary.
	 */
	loadSerializedSummary(blobData: string): ITelemetryBaseProperties;

	/**
	 * Loads a deserialized summary before local state exists.
	 * @param summary - The summary to load.
	 */
	loadSummary(summary: SharedTreeSummaryBase): void;

	/**
	 * Applies edits from another tree, with optional stable ID conversion.
	 * Edit payloads remain unchanged.
	 * @param other - The source tree.
	 * @param edits - The source edits to apply, in order.
	 * @param stableIdRemapper - An optional function to convert stable IDs.
	 * @returns The IDs of the new edits.
	 */
	mergeEditsFrom(
		other: ISharedTree,
		edits: Iterable<Edit<InternalizedChange>>,
		stableIdRemapper?: (id: StableNodeId) => StableNodeId
	): EditId[];

	/**
	 * Applies an edit that reverses a previous edit.
	 * @param editId - The ID of the edit to revert.
	 * @returns The replacement edit ID, or undefined if the edit cannot be inverted.
	 */
	revert(editId: EditId): EditId | undefined;

	/**
	 * Computes the inverse of internal changes.
	 * @param changes - The changes to invert.
	 * @param before - The view before the original changes.
	 * @returns The inverse changes, or undefined if inversion fails.
	 */
	revertChanges(changes: readonly InternalizedChange[], before: RevisionView): ChangeInternal[] | undefined;

	/**
	 * Saves a serialized summary when no local edits remain.
	 * @param options - An optional serializer. The tree serializer is the default.
	 * @returns The serialized summary.
	 */
	saveSerializedSummary(options?: { serializer?: IFluidSerializer }): string;

	/**
	 * Saves a deserialized summary when no local edits remain.
	 * @returns The summary.
	 */
	saveSummary(): SharedTreeSummaryBase;

	/**
	 * Creates a single-blob summary when no local edits remain.
	 * @param serializer - The serializer for handles in the summary.
	 * @returns The summary and its statistics.
	 */
	summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats;
}
