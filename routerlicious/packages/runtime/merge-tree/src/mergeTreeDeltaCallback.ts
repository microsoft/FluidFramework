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
    readonly groupOp?: IMergeTreeGroupMsg;
    readonly op: IMergeTreeOp;
    readonly sequencedMessage?: ISequencedDocumentMessage;
    readonly local: boolean;
}

export interface IMergeTreeClientSequenceArgs {
    readonly clientId: number;
    readonly referenceSequenceNumber: number;
    readonly sequenceNumber: number;
}

export type MergeTreeDeltaCallback =
    (opArgs: IMergeTreeDeltaOpArgs, deltaArgs: IMergeTreeDeltaCallbackArgs) => void;
