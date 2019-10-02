/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Plugin, Transaction } from "prosemirror-state";
import { SharedString } from "@prague/sequence";
import { EditorView } from "prosemirror-view";
import {
    createRemoveRangeOp,
    createGroupOp,
    IMergeTreeOp,
} from "@prague/merge-tree";
import { Schema } from "prosemirror-model";
import { sliceToGroupOps, ProseMirrorTransactionBuilder } from "./fluidBridge";

export class FluidCollabPlugin {
    public readonly plugin: Plugin;

    constructor(private readonly sharedString: SharedString, private readonly schema: Schema) {
        this.plugin = new Plugin({
            state: {
                init: () => {
                    return null;
                },
                apply: (tr) => {
                    this.applyTransaction(tr);
                    return null;
                }
            },
        });
    }

    public attachView(editorView: EditorView) {
        let sliceBuilder: ProseMirrorTransactionBuilder;

        this.sharedString.on(
            "pre-op",
            (op, local) => {
                if (local) {
                    return;
                }

                sliceBuilder = new ProseMirrorTransactionBuilder(
                    editorView.state,
                    this.schema,
                    this.sharedString);
            });

        this.sharedString.on(
            "sequenceDelta",
            (ev) => {
                if (ev.isLocal) {
                    return;
                }

                sliceBuilder.addSequencedDelta(ev);
            });

        this.sharedString.on(
            "op",
            (op, local) => {
                if (local) {
                    return;
                }

                const tr = sliceBuilder.build();
                editorView.dispatch(tr);
            });
    }

    private applyTransaction(tr: Transaction<any>) {
        if (tr.getMeta("fluid-local")) {
            return;
        }

        for (const step of tr.steps) {
            // This is a good place for me to tweak changes and ignore local stuff...
            console.log(JSON.stringify(step, null, 2));

            const stepAsJson = step.toJSON();
            switch (stepAsJson.stepType) {
                case "replace": {
                    const from = stepAsJson.from;
                    const to = stepAsJson.to;

                    let operations = new Array<IMergeTreeOp>();

                    if (from !== to) {
                        const removeOp = createRemoveRangeOp(from, to);
                        operations.push(removeOp);
                    }

                    if (stepAsJson.slice) {
                        const sliceOperations = sliceToGroupOps(
                            from,
                            stepAsJson.slice,
                            this.schema);
                        operations = operations.concat(sliceOperations);
                    }

                    const groupOp = createGroupOp(...operations);
                    this.sharedString.groupOperation(groupOp);
                    
                    break;
                }
                
                case "replaceAround": {
                    let operations = new Array<IMergeTreeOp>();

                    const from = stepAsJson.from;
                    const to = stepAsJson.to;
                    const gapFrom = stepAsJson.gapFrom;
                    const gapTo = stepAsJson.gapTo;
                    const insert = stepAsJson.insert;

                    // export class ReplaceAroundStep extends Step {
                    // :: (number, number, number, number, Slice, number, ?bool)
                    // Create a replace-around step with the given range and gap.
                    // `insert` should be the point in the slice into which the content
                    // of the gap should be moved. `structure` has the same meaning as
                    // it has in the [`ReplaceStep`](#transform.ReplaceStep) class.
                    // {
                    //     "stepType": "replaceAround",
                    //     "from": 0,
                    //     "to": 15,
                    //     "gapFrom": 0,
                    //     "gapTo": 15,
                    //     "insert": 2,
                    //     "slice": {
                    //         "content": [
                    //         {
                    //             "type": "bullet_list",
                    //             "content": [
                    //             {
                    //                 "type": "list_item"
                    //             }
                    //             ]
                    //         }
                    //         ]
                    //     },
                    //     "structure": true
                    //     }

                    if (gapTo !== to) {
                        const removeOp = createRemoveRangeOp(gapTo, to);
                        operations.push(removeOp);
                    }

                    if (gapFrom !== from) {
                        const removeOp = createRemoveRangeOp(from, gapFrom);
                        operations.push(removeOp);
                    }

                    if (stepAsJson.slice) {
                        const sliceOperations = sliceToGroupOps(
                            from,
                            stepAsJson.slice,
                            this.schema,
                            insert ? from + insert : insert,
                            gapTo - gapFrom);
                        operations = operations.concat(sliceOperations);
                    }

                    const groupOp = createGroupOp(...operations);
                    this.sharedString.groupOperation(groupOp);

                    break;
                }

                case "addMark": {
                    const attrs = stepAsJson.mark.attrs || true;

                    this.sharedString.annotateRange(
                        stepAsJson.from,
                        stepAsJson.to,
                        { [stepAsJson.mark.type]: attrs });

                    break;
                }

                case "removeMark": {
                    // Is there a way to actually clear an annotation?
                    this.sharedString.annotateRange(
                        stepAsJson.from,
                        stepAsJson.to,
                        { [stepAsJson.mark.type]: false });

                    break;
                }

                default:
            }
        }
    }
}
