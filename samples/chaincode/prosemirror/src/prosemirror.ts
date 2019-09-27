/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
    IComponentHTMLOptions,
    IComponentHTMLVisual,
    IComponentHandle,
} from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import { ISharedMap, SharedMap } from "@prague/map";
import {
    IMergeTreeInsertMsg,
    ReferenceType,
    reservedRangeLabelsKey,
    MergeTreeDeltaType,
    createMap,
    TextSegment,
    Marker,
} from "@prague/merge-tree";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";
import { ISharedObjectFactory } from "@prague/shared-object-common";
import * as assert from "assert";
import { EventEmitter } from "events";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema, NodeSpec } from "prosemirror-model";
import { addListNodes } from "prosemirror-schema-list";
import { exampleSetup } from "prosemirror-example-setup";
import { IProseMirrorNode } from "./fluidBridge";
import { FluidCollabPlugin } from "./fluidPlugin";
import { schema } from "./fluidSchema";
import { create as createSelection } from "./selection";

require("prosemirror-view/style/prosemirror.css");
require("prosemirror-menu/style/menu.css");
require("prosemirror-example-setup/style/style.css");
require("./style.css");

import OrderedMap = require('orderedmap');

const nodeTypeKey = "nodeType";

function createTreeMarkerOps(
    treeRangeLabel: string,
    beginMarkerPos: number,
    endMarkerPos: number,
    nodeType: string,
): IMergeTreeInsertMsg[] {

    const endMarkerProps = createMap<any>();
    endMarkerProps[reservedRangeLabelsKey] = [treeRangeLabel];
    endMarkerProps[nodeTypeKey] = nodeType;

    const beginMarkerProps = createMap<any>();
    beginMarkerProps[reservedRangeLabelsKey] = [treeRangeLabel];
    beginMarkerProps[nodeTypeKey] = nodeType;

    return [
        {
            seg: { marker: { refType: ReferenceType.NestBegin }, props: beginMarkerProps },
            pos1: beginMarkerPos,
            type: MergeTreeDeltaType.INSERT,
        },
        {
            seg: { marker: { refType: ReferenceType.NestEnd }, props: endMarkerProps },
            pos1: endMarkerPos,
            type: MergeTreeDeltaType.INSERT,
        },
    ];
}

export class ProseMirror extends EventEmitter implements IComponentLoadable, IComponentRouter, IComponentHTMLVisual {
    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new ProseMirror(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLVisual() { return this; }

    public url: string;
    public text: SharedString;
    private root: ISharedMap;
    private textArea: HTMLDivElement;
    private content: HTMLDivElement;
    private editorView: EditorView;

    constructor(
        private runtime: IComponentRuntime,
        /* private */ context: IComponentContext,
    ) {
        super();

        this.url = context.id;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            const text = SharedString.create(this.runtime);

            const ops = createTreeMarkerOps("prosemirror", 0, 1, "paragraph");
            text.groupOperation({ ops, type: MergeTreeDeltaType.GROUP });
            text.insertText(1, "Hello, world!");

            // text.annotateRange(4, 6, { bold: true });
            // text.annotateRange(5, 6, { yellow: "mello" });

            this.root.set("text", text.handle);
            this.root.register();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
        this.text = await this.root.get<IComponentHandle>("text").get<SharedString>();

        // access for debugging
        window["easyText"] = this.text;
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        // create base textarea
        if (!this.textArea) {
            this.textArea = document.createElement("div");
            this.textArea.classList.add("editor");
            this.content = document.createElement("div");
            this.content.style.display = "none";
            this.content.innerHTML = "";
        }

        // reparent if needed
        if (this.textArea.parentElement !== elm) {
            this.textArea.remove();
            this.content.remove();
            elm.appendChild(this.textArea);
            elm.appendChild(this.content);
        }

        if (!this.editorView) {
            this.setupEditor();
        }
    }

    private setupEditor() {
        // Initialize the base ProseMirror JSON data structure
        const nodeStack = new Array<IProseMirrorNode>();
        nodeStack.push({ type: "doc", content: [] });

        this.text.walkSegments((segment) => {
            let top = nodeStack[nodeStack.length - 1];

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
                        })
                    }
                }

                top.content.push(nodeJson);
            } else if (Marker.is(segment)) {
                // TODO are marks applied to the structural nodes as well? Or just inner text?

                const nodeType = segment.properties[nodeTypeKey];
                switch (segment.refType) {
                    case ReferenceType.NestBegin:
                        // Create the new node, add it to the top's content, and push it on the stack
                        const newNode = { type: nodeType, content: [] };
                        top.content.push(newNode);
                        nodeStack.push(newNode);
                        break;

                    case ReferenceType.NestEnd:
                        const popped = nodeStack.pop();
                        assert(popped.type === nodeType);
                        break;

                    case ReferenceType.Simple:
                        // TODO consolidate the text segment and simple references
                        const nodeJson: IProseMirrorNode = {
                            type: segment.properties["type"],
                            attrs: segment.properties["attrs"],
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

                        top.content.push(nodeJson);
                        break;

                    default:
                        // throw for now when encountering something unknown
                        throw new Error("Unknown marker");
                }
            }

            return true;
        });

        const doc = nodeStack.pop();
        console.log(JSON.stringify(doc, null, 2));

        const fluidSchema = new Schema({
            nodes: addListNodes(schema.spec.nodes as OrderedMap<NodeSpec>, "paragraph block*", "block"),
            marks: schema.spec.marks
        });

        const fluidDoc = fluidSchema.nodeFromJSON(doc);

        // initialize the prosemirror schema from the sequence
        console.log(JSON.stringify(fluidDoc.toJSON(), null, 2));

        const fluidPlugin = new FluidCollabPlugin(this.text, fluidSchema);

        const state = EditorState.create({
            doc: fluidDoc,
            plugins: exampleSetup({ schema: fluidSchema })
                .concat(fluidPlugin.plugin)
                .concat(createSelection()),
        });

        this.editorView = new EditorView(
            this.textArea,
            {
                state,
            });
        fluidPlugin.attachView(this.editorView);

        window["easyView"] = this.editorView;
    }
}

class ProseMirrorFactory implements IComponentFactory {
    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const mapFactory = SharedMap.getFactory();
        const sequenceFactory = SharedString.getFactory();

        dataTypes.set(mapFactory.type, mapFactory);
        dataTypes.set(sequenceFactory.type, sequenceFactory);

        ComponentRuntime.load(
            context,
            dataTypes,
            (runtime) => {
                const progressCollectionP = ProseMirror.load(runtime, context);
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const progressCollection = await progressCollectionP;
                    return progressCollection.request(request);
                });
            });
    }
}

export const fluidExport = new ProseMirrorFactory();

export function instantiateComponent(context: IComponentContext): void {
    fluidExport.instantiateComponent(context);
}
