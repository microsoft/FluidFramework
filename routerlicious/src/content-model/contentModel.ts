// tslint:disable
import * as MergeTree from "../merge-tree";
import * as core from "../api-core";
import { SharedString } from "../shared-string";
import { Table } from "../text";
import { ICollaborativeObject } from "../api-core";

export function sharedStringModel(): core.IContentModelExtension {
    function insertColumn(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage, sharedString: SharedString) {
        Table.finishInsertedColumn(op.macroOp.params["cellId"], msg, sharedString);
    }

    function insertRow(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage, sharedString: SharedString) {
        Table.finishInsertedRow(op.macroOp.params["rowId"], op.macroOp.params["prevRowId"], msg, sharedString);
    }

    function deleteRow(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage, sharedString: SharedString) {
        Table.finishDeletedRow(op.macroOp.params["rowId"], msg, sharedString);
    }

    function deleteCellShiftLeft(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage, sharedString: SharedString) {
        Table.finishDeletedCell(op.macroOp.params["cellPos"], msg, sharedString);
    }

    function deleteColumn(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage, sharedString: SharedString) {
        Table.finishDeletedColumn(op.macroOp.params["cellPos"], op.macroOp.params["rowId"], msg, sharedString);
    }

    function exec(message: core.ISequencedObjectMessage, instance: ICollaborativeObject) {
        if (message.type === core.OperationType) {
            let op = <MergeTree.IMergeTreeOp>message.contents;
            if ((op.type === MergeTree.MergeTreeDeltaType.GROUP) && (op.macroOp)) {
                switch (op.macroOp.name) {
                    case "insertColumn":
                        insertColumn(op, message, <SharedString>instance);
                        break;
                    case "insertRow":
                        insertRow(op, message, <SharedString>instance);
                        break;
                    case "deleteRow":
                        deleteRow(op, message, <SharedString>instance);
                        break;
                    case "deleteCellShiftLeft":
                        deleteCellShiftLeft(op, message, <SharedString>instance);
                        break;
                    case "deleteColumn":
                        deleteColumn(op, message, <SharedString>instance);
                        break;
                }
            }
        }
    }
    return {
        exec,
        type: "shared-string",
    };
}
