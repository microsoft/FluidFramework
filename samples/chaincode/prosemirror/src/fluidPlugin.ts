/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Plugin, Transaction } from "prosemirror-state";
import { SharedString, ISequenceDeltaRange, SequenceDeltaEvent } from "@prague/sequence";
import { EditorView } from "prosemirror-view";
import {
    MergeTreeDeltaType,
    TextSegment,
    Marker,
    ReferenceType,
    createRemoveRangeOp,
    createGroupOp,
    IMergeTreeOp,
} from "@prague/merge-tree";
import { Schema } from "prosemirror-model";
import { sliceToGroupOps, segmentsToSlice } from "./fluidBridge";

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
        let sequencedDeltas = new Array<SequenceDeltaEvent>();

        // TODO given that the relative positions will be changing I believe I will need to apply these
        // as they arrive

        this.sharedString.on(
            "pre-op",
            (op, local) => {
                if (local) {
                    return;
                }
            });

        this.sharedString.on(
            "sequenceDelta",
            (ev) => {
                if (ev.isLocal) {
                    return;
                }

                sequencedDeltas.push(ev);
            });

        this.sharedString.on(
            "op",
            (op, local) => {
                if (local) {
                    return;
                }

                this.processSequencedDeltas(sequencedDeltas, editorView);
                sequencedDeltas = new Array<SequenceDeltaEvent>();
            });
    }

    private processSequencedDeltas(sequencedDeltas: SequenceDeltaEvent[], editorView: EditorView) {
        const transaction = editorView.state.tr;

        let allRanges = new Array<ISequenceDeltaRange>();
        sequencedDeltas.forEach((delta) => { allRanges = allRanges.concat(delta.ranges); });

        for (let i = 0; i < allRanges.length; i++) {
            const range = allRanges[i];
            const segment = range.segment;

            if (range.operation === MergeTreeDeltaType.INSERT) {
                const insertSegments = new Array<ISequenceDeltaRange>();
                while (i < allRanges.length) {
                    if (allRanges[i].operation !== MergeTreeDeltaType.INSERT) {
                        break;
                    }

                    insertSegments.push(allRanges[i]);
                    i++;
                }

                const slice = segmentsToSlice(this.sharedString, insertSegments);
                transaction.replace(insertSegments[0].position, insertSegments[0].position, slice);
            } else if (range.operation === MergeTreeDeltaType.REMOVE) {
                if (TextSegment.is(segment)) {
                    transaction.replace(range.position, range.position + segment.text.length);
                } else if (Marker.is(segment)) {
                    if (segment.refType === ReferenceType.Simple) {
                        transaction.replace(range.position, range.position + 1);
                    }
                }
            } else if (range.operation === MergeTreeDeltaType.ANNOTATE) {
                for (const prop of Object.keys(range.propertyDeltas)) {
                    const value = range.segment.properties[prop];

                    // TODO I think I need to query the sequence for *all* marks and then set them here
                    // for PM it's an all or nothing set. Not anything additive

                    const length = TextSegment.is(segment) ? segment.text.length : 1;

                    if (value) {
                        transaction.addMark(
                            range.position,
                            range.position + length,
                            this.schema.marks[prop].create(value));
                    } else {
                        transaction.removeMark(
                            range.position,
                            range.position + length,
                            this.schema.marks[prop]);
                    }
                }
            }
        }

        transaction.setMeta("fluid-local", true);

        editorView.dispatch(transaction);
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
                case "replace":
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

                case "addMark":
                    const attrs = stepAsJson.mark.attrs || true;

                    this.sharedString.annotateRange(
                        stepAsJson.from,
                        stepAsJson.to,
                        { [stepAsJson.mark.type]: attrs });

                    break;

                case "removeMark":
                    // Is there a way to actually clear an annotation?
                    this.sharedString.annotateRange(
                        stepAsJson.from,
                        stepAsJson.to,
                        { [stepAsJson.mark.type]: false });

                    break;

                default:
            }
        }
    }
}
