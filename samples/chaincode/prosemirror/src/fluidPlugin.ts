/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Plugin, Transaction } from "prosemirror-state";
import { SharedString } from "@prague/sequence";
import { EditorView } from "prosemirror-view";
import { MergeTreeDeltaType, TextSegment, Marker, ReferenceType } from "@prague/merge-tree";
import { Schema } from "prosemirror-model";

export class FluidCollabPlugin {
    public readonly plugin: Plugin;

    constructor(private readonly sharedString: SharedString, private readonly schema: Schema) {
        this.plugin = new Plugin({
            state: {
                init: (config, instance) => {
                    return null;
                },
                apply: (tr, old) => {
                    this.applyTransaction(tr);
                    return null;
                }
            },
        });
    }

    public attachView(editorView: EditorView) {
        this.sharedString.on(
            "sequenceDelta",
            (ev) => {
                if (ev.isLocal) {
                    return;
                }

                const transaction = editorView.state.tr;

                for (const range of ev.ranges) {
                    const segment = range.segment;

                    if (range.operation === MergeTreeDeltaType.INSERT) {
                        if (TextSegment.is(segment)) {
                            transaction.insertText(segment.text, range.position);

                            if (segment.properties) {
                                for (const prop of Object.keys(segment.properties)) {
                                    const value = range.segment.properties[prop];
                                    transaction.addMark(
                                        range.position,
                                        range.position + segment.text.length,
                                        this.schema.marks[prop].create(value));
                                }
                            }
                        } else if (Marker.is(segment)) {
                            if (segment.refType === ReferenceType.Simple) {
                                const nodeType = segment.properties["type"];
                                const node = this.schema.nodes[nodeType].create(segment.properties["attrs"]);
                                transaction.insert(range.position, node);
                            }
                        }
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
                case "replace":
                    let from = stepAsJson.from;
                    const to = stepAsJson.to;

                    if (from !== to) {
                        this.sharedString.removeText(from, to);
                    }

                    if (!stepAsJson.slice) {
                        break;
                    }

                    // TODO a replace should be an entire group
                    // iterate over all elements and create a new fragment

                    // {
                    //     "stepType": "replace",
                    //     "from": 14,
                    //     "to": 14,
                    //     "slice": {
                    //         "content": [
                    //         {
                    //             "type": "paragraph"
                    //         },
                    //         {
                    //             "type": "paragraph"
                    //         }
                    //         ],
                    //         "openStart": 1,
                    //         "openEnd": 1
                    //     },
                    //     "structure": true
                    // }

                    for (const content of stepAsJson.slice.content) {
                        let props: any = undefined;

                        if (content.marks) {
                            props = {};
                            for (const mark of content.marks) {
                                props[mark.type] = mark.attrs || true;
                            }
                        }

                        // TODO can probably better use the schema to parse properties. Right now just distinguishing
                        // between the required text node and then the other types
                        if (content.type === "text") {
                            this.sharedString.insertText(stepAsJson.from, content.text, props);
                            from += content.text.length;
                        } else {
                            if (!props) {
                                props = {};
                            }

                            props.type = content.type;
                            props.attrs = content.attrs;

                            this.sharedString.insertMarker(from, ReferenceType.Simple, props);
                            from++;
                        }
                    }
                    
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
