/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { IMergeTreeOp, ISegment, MergeTreeDeltaType } from "./";
import { IMergeTreeGroupMsg } from "./ops";
import { PropertySet } from "./properties";

export type MergeTreeDeltaOperationType =
    MergeTreeDeltaType.ANNOTATE | MergeTreeDeltaType.INSERT | MergeTreeDeltaType.REMOVE;

export interface IMergeTreeDeltaCallbackArgs {
    readonly operation: MergeTreeDeltaOperationType;
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

// Note: Assigned negative integers to avoid clashing with MergeTreeDeltaType
export const enum MergeTreeMaintenanceType {
    APPEND  = -1,
    SPLIT   = -2,
}

export interface IMergeTreeMaintenanceCallbackArgs {
    readonly operation: MergeTreeMaintenanceType;
    readonly deltaSegments: IMergeTreeSegmentDelta[];
}

export type MergeTreeMaintenanceCallback =
    (MaintenanceArgs: IMergeTreeMaintenanceCallbackArgs) => void;
