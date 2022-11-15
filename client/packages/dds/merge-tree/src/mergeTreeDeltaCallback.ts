/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
    IMergeTreeGroupMsg,
    IMergeTreeOp,
    MergeTreeDeltaType,
} from "./ops";
import { PropertySet } from "./properties";
import { ISegment } from "./mergeTreeNodes";

export type MergeTreeDeltaOperationType =
    typeof MergeTreeDeltaType.ANNOTATE | typeof MergeTreeDeltaType.INSERT | typeof MergeTreeDeltaType.REMOVE;

/**
 * Enum-like constant defining the types of "maintenance" events on a merge tree.
 * Maintenance events correspond to structural segment changes or acks of pending segments.
 *
 * Note: these values are assigned negative integers to avoid clashing with `MergeTreeDeltaType`.
 */
export const MergeTreeMaintenanceType = {
    /**
     * Notification that a segment "append" has occurred, i.e. two adjacent segments have been merged.
     * BEWARE: `deltaSegments` on the corresponding event will contain both the merged segment and the latter
     * segment, pre-merge.
     * For example, if the merge tree originally had two adjacent segments [A][B] and called A.append(B) to get
     * segment [AB], `deltaSegments` would contain [AB] and [B].
     */
    APPEND: -1,
    /**
     * Notification that a segment has been split in two.
     * `deltaSegments` on the corresponding event will contain the resulting two segments.
     */
    SPLIT: -2,
    /**
     * Notification that a segment has been unlinked (i.e. removed) from the MergeTree.
     * This occurs on leaf segments during Zamboni when the segment's tracking collection is empty
     * (e.g., not being tracked for undo/redo).
     * It also occurs on internal merge tree segments when re-packing children to maintain tree balancing invariants.
     */
    UNLINK: -3,
    /**
     * Notification that a local change has been acknowledged by the server.
     * This means that it has made the round trip to the server and has had a sequence number assigned.
     */
    ACKNOWLEDGED: -4,
} as const;
export type MergeTreeMaintenanceType = typeof MergeTreeMaintenanceType[keyof typeof MergeTreeMaintenanceType];

export type MergeTreeDeltaOperationTypes = MergeTreeDeltaOperationType | MergeTreeMaintenanceType;

// eslint-disable-next-line max-len
export interface IMergeTreeDeltaCallbackArgs<TOperationType extends MergeTreeDeltaOperationTypes = MergeTreeDeltaOperationType> {
    readonly operation: TOperationType;
    readonly deltaSegments: IMergeTreeSegmentDelta[];
}

export interface IMergeTreeSegmentDelta {
    segment: ISegment;
    propertyDeltas?: PropertySet;
}

export interface IMergeTreeDeltaOpArgs {
    /**
     * The group op which contains the operation
     * if there operation is part of a group op.
     */
    readonly groupOp?: IMergeTreeGroupMsg;
    /**
     * The merge tree operation
     */
    readonly op: IMergeTreeOp;
    /**
     * Get the sequence message, should only be null if the
     * Delta op args are for an unacked local change
     */
    readonly sequencedMessage?: ISequencedDocumentMessage;
}

export interface IMergeTreeClientSequenceArgs {
    readonly clientId: number;
    readonly referenceSequenceNumber: number;
    readonly sequenceNumber: number;
}

export type MergeTreeDeltaCallback =
    (opArgs: IMergeTreeDeltaOpArgs, deltaArgs: IMergeTreeDeltaCallbackArgs) => void;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IMergeTreeMaintenanceCallbackArgs extends IMergeTreeDeltaCallbackArgs<MergeTreeMaintenanceType> { }

export type MergeTreeMaintenanceCallback =
    (MaintenanceArgs: IMergeTreeMaintenanceCallbackArgs, opArgs: IMergeTreeDeltaOpArgs | undefined) => void;
