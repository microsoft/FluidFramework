/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { EventEmitter } from "events";
import { assert } from "@fluidframework/common-utils";
import { ILoader } from "@fluidframework/container-definitions";
import {
    createGroupOp,
    createRemoveRangeOp,
    Marker,
    ReferenceType,
    TextSegment,
    IMergeTreeDeltaOp,
} from "@fluidframework/merge-tree";
import { SharedString } from "@fluidframework/sequence";
import { buildMenuItems, exampleSetup } from "prosemirror-example-setup";
import { MenuItem } from "prosemirror-menu";
import { DOMSerializer, Fragment, NodeSpec, Schema, Slice } from "prosemirror-model";
import { addListNodes } from "prosemirror-schema-list";
import { EditorState, NodeSelection, Plugin, Transaction } from "prosemirror-state";

// eslint-disable-next-line @typescript-eslint/no-require-imports
import OrderedMap = require("orderedmap");

import { insertPoint } from "prosemirror-transform";
import { EditorView } from "prosemirror-view";
import { ComponentView } from "./componentView";
import { IProseMirrorNode, nodeTypeKey, ProseMirrorTransactionBuilder, sliceToGroupOps } from "./fluidBridge";
import { schema } from "./fluidSchema";
import { FootnoteView } from "./footnoteView";
import { openPrompt, TextField } from "./prompt";
import { create as createSelection } from "./selection";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideRichTextEditor>> { }
}

export const IRichTextEditor: keyof IProvideRichTextEditor = "IRichTextEditor";

export interface IProvideRichTextEditor {
    readonly IRichTextEditor: IRichTextEditor;
}

export interface IRichTextEditor extends IProvideRichTextEditor {
    getValue(): string;

    initializeValue(value: string): void;
}

export class FluidCollabManager extends EventEmitter implements IRichTextEditor {
    public get IRichTextEditor() { return this; }

    public readonly plugin: Plugin;
    private readonly schema: Schema;
    private state: EditorState;
    private editorView: EditorView | undefined;

    constructor(private readonly text: SharedString, private readonly loader: ILoader) {
        super();

        this.plugin = new Plugin({
            state: {
                init: () => null,
                apply: (tr) => {
                    this.applyTransaction(tr);
                    return null;
                },
            },
        });

        const fluidSchema = new Schema({
            nodes: addListNodes(schema.spec.nodes as OrderedMap<NodeSpec>, "paragraph block*", "block"),
            marks: schema.spec.marks,
        });
        this.schema = fluidSchema;

        // Initialize the base ProseMirror JSON data structure
        const nodeStack = new Array<IProseMirrorNode>();
        nodeStack.push({ type: "doc", content: [] });

        this.text.walkSegments((segment) => {
            const top = nodeStack[nodeStack.length - 1];

            if (TextSegment.is(segment)) {
                const nodeJson: IProseMirrorNode = {
                    type: "text",
                    text: segment.text,
                };

                if (segment.properties) {
                    nodeJson.marks = [];
                    for (const propertyKey of Object.keys(segment.properties)) {
                        nodeJson.marks.push({
                            type: propertyKey,
                            value: segment.properties[propertyKey],
                        });
                    }
                }

                top.content!.push(nodeJson);
            } else if (Marker.is(segment)) {
                // TODO are marks applied to the structural nodes as well? Or just inner text?

                const nodeType = segment.properties![nodeTypeKey];
                switch (segment.refType) {
                    case ReferenceType.NestBegin:
                        // Create the new node, add it to the top's content, and push it on the stack
                        const newNode = { type: nodeType, content: [] };
                        top.content!.push(newNode);
                        nodeStack.push(newNode);
                        break;

                    case ReferenceType.NestEnd:
                        const popped = nodeStack.pop();
                        assert(popped!.type === nodeType);
                        break;

                    case ReferenceType.Simple:
                        // TODO consolidate the text segment and simple references
                        const nodeJson: IProseMirrorNode = {
                            type: segment.properties!.type,
                            attrs: segment.properties!.attrs,
                        };

                        if (segment.properties) {
                            nodeJson.marks = [];
                            for (const propertyKey of Object.keys(segment.properties)) {
                                if (propertyKey !== "type" && propertyKey !== "attrs") {
                                    nodeJson.marks.push({
                                        type: propertyKey,
                                        value: segment.properties[propertyKey],
                                    });
                                }
                            }
                        }

                        top.content!.push(nodeJson);
                        break;

                    default:
                        // Throw for now when encountering something unknown
                        throw new Error("Unknown marker");
                }
            }

            return true;
        });

        const menu = buildMenuItems(this.schema);
        menu.insertMenu.content.push(new MenuItem({
            title: "Insert Component",
            label: "Component",
            enable: (state) => true,
            run: (state, _, view) => {
                const { from, to } = state.selection;
                let nodeAttrs: any = null;
                if (state.selection instanceof NodeSelection && state.selection.node.type === fluidSchema.nodes.fluid) {
                    nodeAttrs = state.selection.node.attrs;
                }
                openPrompt({
                    title: "Insert component",
                    fields: {
                        src: new TextField({ label: "Url", required: true, value: nodeAttrs && nodeAttrs.src }),
                        title: new TextField({ label: "Title", value: nodeAttrs && nodeAttrs.title }),
                        alt: new TextField({
                            label: "Description",
                            value: nodeAttrs ? nodeAttrs.alt : state.doc.textBetween(from, to, " "),
                        }),
                    },
                    callback(attrs) {
                        view.dispatch(view.state.tr.replaceSelectionWith(fluidSchema.nodes.fluid.createAndFill(attrs)));
                        view.focus();
                    },
                });
            },
        }));

        menu.insertMenu.content.push(new MenuItem({
            title: "Insert footnote",
            label: "Footnote",
            select: (state) => insertPoint(state.doc, state.selection.from, fluidSchema.nodes.footnote) != null,
            run(state, dispatch) {
                const { empty, $from, $to } = state.selection;
                let content = Fragment.empty;
                if (!empty && $from.sameParent($to) && $from.parent.inlineContent) {
                    content = $from.parent.content.cut($from.parentOffset, $to.parentOffset);
                }
                dispatch(state.tr.replaceSelectionWith(fluidSchema.nodes.footnote.create(null, content)));
            },
        }));

        const doc = nodeStack.pop()!;
        console.log(JSON.stringify(doc, null, 2));

        const fluidDoc = this.schema.nodeFromJSON(doc);
        this.state = EditorState.create({
            doc: fluidDoc,
            plugins:
                exampleSetup({
                    schema: this.schema,
                    menuContent: menu.fullMenu,
                })
                    .concat(this.plugin)
                    .concat(createSelection()),
        });

        let sliceBuilder: ProseMirrorTransactionBuilder;

        this.text.on(
            "pre-op",
            (op, local) => {
                if (local) {
                    return;
                }

                const startState = this.getCurrentState();
                sliceBuilder = new ProseMirrorTransactionBuilder(
                    startState,
                    this.schema,
                    this.text);
            });

        this.text.on(
            "sequenceDelta",
            (ev) => {
                if (ev.isLocal) {
                    return;
                }

                sliceBuilder.addSequencedDelta(ev);
            });

        this.text.on(
            "op",
            (op, local) => {
                this.emit("valueChanged");

                if (local) {
                    return;
                }

                const tr = sliceBuilder.build();
                this.apply(tr);
            });
    }

    public getValue(): string {
        const currentState = this.getCurrentState();

        const fragment = DOMSerializer
            .fromSchema(this.schema)
            .serializeFragment(currentState.doc.content);
        const wrapper = document.createElement("div");
        wrapper.appendChild(fragment);
        return wrapper.innerHTML;
    }

    public initializeValue(value: string): void {
        const state = this.getCurrentState();
        const tr = state.tr;
        const node = this.schema.nodeFromJSON(
            {
                type: "paragraph",
                content: [
                    {
                        type: "text",
                        text: value,
                    },
                ],
            });

        tr.replaceRange(0, state.doc.content.size, new Slice(node.content, 0, 0));

        this.apply(tr);
    }

    public setupEditor(textArea: HTMLDivElement) {
        /* eslint-disable @typescript-eslint/no-require-imports,
        import/no-internal-modules, import/no-unassigned-import */
        require("prosemirror-view/style/prosemirror.css");
        require("prosemirror-menu/style/menu.css");
        require("prosemirror-example-setup/style/style.css");
        require("./style.css");
        /* eslint-enable @typescript-eslint/no-require-imports,
        import/no-internal-modules, import/no-unassigned-import */

        const editorView = new EditorView(
            textArea,
            {
                state: this.state,
                nodeViews: {
                    fluid: (node, view, getPos) => new ComponentView(node, view, getPos, this.loader),
                    footnote: (node, view, getPos) => new FootnoteView(node, view, getPos, this.loader),
                },
            });

        this.editorView = editorView;

        // eslint-disable-next-line @typescript-eslint/dot-notation
        window["easyView"] = editorView;

        return editorView;
    }

    private getCurrentState() {
        return this.editorView ? this.editorView.state : this.state;
    }

    private apply(tr: Transaction) {
        if (this.editorView) {
            this.editorView.dispatch(tr);
        } else {
            this.state = this.state.apply(tr);
        }
    }

    private applyTransaction(tr: Transaction) {
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

                    let operations = new Array<IMergeTreeDeltaOp>();

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
                    this.text.groupOperation(groupOp);

                    break;
                }

                case "replaceAround": {
                    let operations = new Array<IMergeTreeDeltaOp>();

                    const from = stepAsJson.from;
                    const to = stepAsJson.to;
                    const gapFrom = stepAsJson.gapFrom;
                    const gapTo = stepAsJson.gapTo;
                    const insert = stepAsJson.insert;

                    // Export class ReplaceAroundStep extends Step {
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
                    this.text.groupOperation(groupOp);

                    break;
                }

                case "addMark": {
                    const attrs = stepAsJson.mark.attrs || true;

                    this.text.annotateRange(
                        stepAsJson.from,
                        stepAsJson.to,
                        { [stepAsJson.mark.type]: attrs });

                    break;
                }

                case "removeMark": {
                    // Is there a way to actually clear an annotation?
                    this.text.annotateRange(
                        stepAsJson.from,
                        stepAsJson.to,
                        { [stepAsJson.mark.type]: false });

                    break;
                }

                default:
                    break;
            }
        }
    }
}
