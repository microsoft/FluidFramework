/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IMergeTreeGroupMsg } from "./ops";
import { PropertySet } from "./properties";
import { IMergeTreeOp, ISegment, MergeTreeDeltaType } from "./";

export type MergeTreeDeltaOperationType =
    MergeTreeDeltaType.ANNOTATE | MergeTreeDeltaType.INSERT | MergeTreeDeltaType.REMOVE;

// Note: Assigned negative integers to avoid clashing with MergeTreeDeltaType
export const enum MergeTreeMaintenanceType {
    APPEND = -1,
    SPLIT = -2,
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

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IMergeTreeMaintenanceCallbackArgs extends IMergeTreeDeltaCallbackArgs<MergeTreeMaintenanceType> { }

export type MergeTreeMaintenanceCallback =
    (MaintenanceArgs: IMergeTreeMaintenanceCallbackArgs) => void;
