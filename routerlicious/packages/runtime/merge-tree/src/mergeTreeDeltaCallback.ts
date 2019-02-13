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

export interface IMergeTreeDeltaOpCallbackArgs {
    readonly groupOp?: IMergeTreeGroupMsg;
    readonly op: IMergeTreeOp;
    readonly sequencedMessage?: ISequencedDocumentMessage;
}

export type MergeTreeDeltaCallback =
    (opArgs: IMergeTreeDeltaOpCallbackArgs, deltaArgs: IMergeTreeDeltaCallbackArgs) => void;
