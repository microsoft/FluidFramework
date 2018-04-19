// tslint:disable
import * as MergeTree from "../merge-tree";
import { SharedString } from "../shared-string";
import * as core from "../api-core";
import { Table } from "../text";

export interface IContentModel {
    exec(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage);
}

export function contentModelCreate(sharedString: SharedString): IContentModel {
    function insertColumn(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage) {
        Table.finishInsertedColumn(op.macroOp.params["cellId"], msg, sharedString);
    }

    function insertRow(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage) {
        Table.finishInsertedRow(op.macroOp.params["rowId"], op.macroOp.params["prevRowId"], msg, sharedString);
    }

    function exec(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage) {
        switch (op.macroOp.name) {
            case "insertColumn":
                insertColumn(op, msg);
                break;
            case "insertRow":
                insertRow(op, msg);
                break;
        }
    }
    return {
        exec,
    };
}
