/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseProperties } from '@fluidframework/core-interfaces';
import type { IChannelServices, IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions/internal';
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
 * Use the {@link (SharedTree:variable)} factory object to create an instance through the factory registered with the data store runtime.
 * That factory determines the write format and options, while this interface describes the instance that your code uses.
 *
 * @sealed
 * @alpha
 */
export interface ISharedTree extends ISharedObject<ISharedTreeEvents>, NodeIdContext {
	/**
	 * The attribution ID for nodes that this tree creates.
	 * With write format 0.1.1 or later, the constructor can configure this ID.
	 * Trees with write format 0.0.2 use the nil UUID instead.
	 */
	readonly attributionId: AttributionId;

	/**
	 * Whether this tree has an active connection to the delta stream.
	 * A local tree remains disconnected until it attaches to the document and establishes that connection.
	 */
	readonly connected: boolean;

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
	 * Because this revision can change as remote edits arrive, use {@link Checkout} when you need snapshot isolation.
	 *
	 * @param changes - The changes to apply.
	 * @returns The new edit.
	 */
	applyEdit(...changes: readonly Change[]): Edit<InternalizedChange>;

	/**
	 * Applies an array of changes to the most recent revision.
	 * Because this revision can change as remote edits arrive, use {@link Checkout} when you need snapshot isolation.
	 *
	 * @param changes - The changes to apply.
	 * @returns The new edit.
	 */
	applyEdit(changes: readonly Change[]): Edit<InternalizedChange>;

	/**
	 * Applies internal changes or an edit to the most recent revision.
	 * This method is for internal use only, so application code must use `applyEdit` instead.
	 *
	 * @param editOrChanges - The edit or internal changes to apply.
	 * @returns The applied edit.
	 */
	applyEditInternal(editOrChanges: Edit<ChangeInternal> | readonly ChangeInternal[]): Edit<ChangeInternal>;

	/**
	 * Gets the attribution ID of the tree that generated a node ID.
	 * Attribution requires write format 0.1.1 or later.
	 * With write format 0.0.2, attribution is unavailable and this method returns the nil UUID instead.
	 *
	 * @param id - The node ID to inspect.
	 * @returns The attribution ID, or the nil UUID for write format 0.0.2.
	 */
	attributeNodeId(id: NodeId): AttributionId;

	/**
	 * Compares semantic views and ordered edit IDs for internal correctness tests.
	 * This comparison ignores whether edits are local or sequenced, and it also excludes:
	 *
	 * - Open edits.
	 * - Tree IDs.
	 * - Event listeners.
	 * - Cache state.
	 *
	 * @param sharedTree - The tree to compare.
	 * @returns Whether the trees have equal views and edit IDs.
	 */
	equals(sharedTree: ISharedTree): boolean;

	/**
	 * Emits an error event from a helper that operates on this tree.
	 *
	 * @param event - The error event name.
	 * @param error - The error to report.
	 * @returns Whether the event has a listener.
	 */
	emit(event: 'error', error: unknown): boolean;

	/**
	 * Gets the runtime that owns this tree.
	 * @returns The data store runtime.
	 */
	getRuntime(): IFluidDataStoreRuntime;

	/**
	 * Gets the write format that this tree currently uses.
	 * The constructor sets the initial format, but the tree can upgrade it during collaboration or summary load.
	 *
	 * @returns The current write format.
	 */
	getWriteFormat(): WriteFormat;

	/**
	 * Converts a public change to the internal representation used by `applyEditInternal`.
	 * Like `applyEditInternal`, this method is for internal use only.
	 *
	 * @param change - The change to convert.
	 * @returns The internal change.
	 */
	internalizeChange(change: Change): ChangeInternal;

	/**
	 * Initializes a new tree as a local object.
	 * The tree can later attach to the document and become shared.
	 */
	initializeLocal(): void;

	/**
	 * Loads an existing tree from storage and connects it to the supplied services.
	 * For a new tree, use `initializeLocal` instead.
	 *
	 * @param services - The storage and delta services for the tree.
	 * @returns A promise that resolves after the tree loads and connects to the services.
	 */
	load(services: IChannelServices): Promise<void>;

	/**
	 * Initializes the tree from a serialized summary for tests.
	 * Because this method initializes the tree, call it before local state exists.
	 *
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
	 * This conversion changes references to stable IDs but leaves edit payloads unchanged.
	 *
	 * @param other - The source tree.
	 * @param edits - The source edits to apply, in order.
	 * @param stableIdRemapper - An optional function that replaces each reference to a stable ID `id` from `other` with `stableIdRemapper(id)`.
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
	 * Saves the tree as a serialized summary for tests.
	 * The tree must have no local edits before it can create this summary.
	 *
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
