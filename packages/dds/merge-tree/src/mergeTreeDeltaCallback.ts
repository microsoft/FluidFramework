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
import { ISegment } from "./mergeTree";

export type MergeTreeDeltaOperationType =
    MergeTreeDeltaType.ANNOTATE | MergeTreeDeltaType.INSERT | MergeTreeDeltaType.REMOVE;

// Note: Assigned negative integers to avoid clashing with MergeTreeDeltaType
export const enum MergeTreeMaintenanceType {
    APPEND = -1,
    SPLIT = -2,
    /**
     * Notification that a segment has been unlinked from the MergeTree.  This occurs during
     * Zamboni when:
     *
     *    a) The minSeq has moved past the segment's removeSeq, in which case the segment
     *       can no longer be referenced by incoming remote ops, and...
     *
     *    b) The segment's tracking collection is empty (e.g., not being tracked for undo/redo).
     */
    UNLINK = -3,
    /**
     * Notification that a local change has been acknowledged by the server.
     * This means that it has made the round trip to the server and has had a sequence number assigned.
     */
    ACKNOWLEDGED = -4,
}

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

export interface IMergeTreeMaintenanceCallbackArgs extends IMergeTreeDeltaCallbackArgs<MergeTreeMaintenanceType> { }

export type MergeTreeMaintenanceCallback =
    (MaintenanceArgs: IMergeTreeMaintenanceCallbackArgs, opArgs: IMergeTreeDeltaOpArgs | undefined) => void;
