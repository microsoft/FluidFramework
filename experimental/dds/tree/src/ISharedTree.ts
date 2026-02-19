/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseProperties } from '@fluidframework/core-interfaces';
import type { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions/internal';
import type { ISharedObject, IFluidSerializer } from '@fluidframework/shared-object-base/internal';
import type { ITelemetryLoggerExt } from '@fluidframework/telemetry-utils/internal';

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
 * A {@link https://github.com/microsoft/FluidFramework/blob/main/experimental/dds/tree/README.md | distributed tree}.
 * @alpha
 */
export interface ISharedTree extends ISharedObject<ISharedTreeEvents>, NodeIdContext {
	/**
	 * The UUID used for attribution of nodes created by this SharedTree.
	 */
	readonly attributionId: AttributionId;

	/**
	 * Viewer for trees defined by the edit log. This allows access to views of the tree at different revisions.
	 */
	readonly logViewer: LogViewer;

	/**
	 * Logger for SharedTree events.
	 */
	readonly logger: ITelemetryLoggerExt;

	/**
	 * @returns the current view of the tree.
	 */
	readonly currentView: RevisionView;

	/**
	 * @returns the edit history of the tree.
	 */
	readonly edits: OrderedEditSet<InternalizedChange>;

	/**
	 * The write format version currently used by this `SharedTree`.
	 */
	getWriteFormat(): WriteFormat;

	/**
	 * Applies a set of changes to this tree.
	 */
	applyEdit(...changes: readonly Change[]): Edit<InternalizedChange>;
	applyEdit(changes: readonly Change[]): Edit<InternalizedChange>;

	/**
	 * Applies a set of internal changes to this tree.
	 * This is exposed for internal use only.
	 */
	applyEditInternal(editOrChanges: Edit<ChangeInternal> | readonly ChangeInternal[]): Edit<ChangeInternal>;

	/**
	 * Converts a public Change type to an internal representation.
	 * This is exposed for internal use only.
	 */
	internalizeChange(change: Change): ChangeInternal;

	/**
	 * Merges `edits` from `other` into this SharedTree.
	 */
	mergeEditsFrom(
		other: ISharedTree,
		edits: Iterable<Edit<InternalizedChange>>,
		stableIdRemapper?: (id: StableNodeId) => StableNodeId
	): EditId[];

	/**
	 * Reverts a previous edit by applying a new edit containing the inverse of the original edit's changes.
	 * @param editId - the edit to revert
	 * @returns the id of the new edit, or undefined if the original edit could not be inverted given the current tree state.
	 */
	revert(editId: EditId): EditId | undefined;

	/**
	 * Revert the given changes.
	 * @param changes - the changes to revert
	 * @param before - the revision view before the changes were originally applied
	 * @returns the inverse of `changes` or undefined if the changes could not be inverted for the given tree state.
	 */
	revertChanges(changes: readonly InternalizedChange[], before: RevisionView): ChangeInternal[] | undefined;

	/**
	 * Returns the attribution ID associated with the SharedTree that generated the given node ID.
	 */
	attributeNodeId(id: NodeId): AttributionId;

	/**
	 * Compares this shared tree to another for equality.
	 */
	equals(sharedTree: ISharedTree): boolean;

	/**
	 * Gets the runtime associated with this SharedTree.
	 */
	getRuntime(): IFluidDataStoreRuntime;

	/**
	 * Saves this SharedTree into a deserialized summary.
	 */
	saveSummary(): SharedTreeSummaryBase;

	/**
	 * Initialize shared tree with a deserialized summary.
	 */
	loadSummary(summary: SharedTreeSummaryBase): void;

	/**
	 * Saves this SharedTree into a serialized summary. This is used for testing.
	 */
	saveSerializedSummary(options?: { serializer?: IFluidSerializer }): string;

	/**
	 * Initialize shared tree with a serialized summary. This is used for testing.
	 * @returns Statistics about the loaded summary.
	 */
	loadSerializedSummary(blobData: string): ITelemetryBaseProperties;
}
