import { ISequencedDocumentMessage } from "@prague/container-definitions";
import { IMergeTreeOp, ISegment, MergeTreeDeltaType } from ".";
import { MergeTree } from "./mergeTree";
import { IMergeTreeGroupMsg } from "./ops";

export type MergeTreeDeltaOperationType =
    MergeTreeDeltaType.ANNOTATE | MergeTreeDeltaType.INSERT | MergeTreeDeltaType.REMOVE;

export interface IMergeTreeDeltaCallbackArgs {
    readonly mergeTreeClientId: number;
    readonly mergeTree: MergeTree;
    readonly operation: MergeTreeDeltaOperationType;
    readonly segments: ISegment[];
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
