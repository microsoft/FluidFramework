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
import { ReferenceType, reservedRangeLabelsKey } from "@prague/merge-tree";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";
import { ISharedObjectFactory } from "@prague/shared-object-common";
import { EventEmitter } from "events";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema, DOMParser, NodeSpec } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { exampleSetup } from "prosemirror-example-setup";
import { fluidPlugin } from "./fluidPlugin";

require("prosemirror-view/style/prosemirror.css");
require("prosemirror-menu/style/menu.css");
require("prosemirror-example-setup/style/style.css");
require("./style.css");

import OrderedMap = require('orderedmap');

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

            // initial paragraph marker
            // text.insertMarker(
            //     0,
            //     ReferenceType.Tile,
            //     { [reservedTileLabelsKey]: ["pg"] });
            const hello = "Hello, world!";
            text.insertMarker(0, ReferenceType.NestEnd, { [reservedRangeLabelsKey]: ["paragraph"], type: "basic" });
            text.insertMarker(0, ReferenceType.NestBegin, { [reservedRangeLabelsKey]: ["paragraph"], type: "basic" });
            text.insertText(1, hello);


            text.insertMarker(3, ReferenceType.NestBegin, { [reservedRangeLabelsKey]: ["paragraph"], type: "cat" });
            text.insertMarker(7, ReferenceType.NestEnd, { [reservedRangeLabelsKey]: ["paragraph"], type: "cat" });

            text.annotateRange(4, 6, { bold: true });
            text.annotateRange(5, 6, { yellow: "mello" });

            this.root.set("text", text.handle);
            this.root.register();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
        this.text = await this.root.get<IComponentHandle>("text").get<SharedString>();

        window["easyText"] = this.text;
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        // create base textarea
        if (!this.textArea) {
            this.textArea = document.createElement("div");
            this.textArea.classList.add("editor");
            this.content = document.createElement("div");
            this.content.style.display = "none";
            this.content.innerHTML =
            `
            `;
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
        // Mix the nodes from prosemirror-schema-list into the basic schema to
        // create a schema with list support.
        const mySchema = new Schema({
            nodes: addListNodes(schema.spec.nodes as OrderedMap<NodeSpec>, "paragraph block*", "block"),
            marks: schema.spec.marks
        });
        
        this.editorView = new EditorView(
            this.textArea,
            {
                state: EditorState.create({
                    doc: DOMParser.fromSchema(mySchema).parse(this.content),
                    plugins: exampleSetup({schema: mySchema}).concat(fluidPlugin),
                })
        })
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
