/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentHandle, ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import {
    IMergeTreeInsertMsg,
    ReferenceType,
    reservedRangeLabelsKey,
    MergeTreeDeltaType,
    createMap,
} from "@microsoft/fluid-merge-tree";
import { IComponentContext, IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { IComponentHTMLOptions, IComponentHTMLView, IComponentHTMLVisual } from "@microsoft/fluid-view-interfaces";
import { EditorView } from "prosemirror-view";
import { nodeTypeKey } from "./fluidBridge";
import { FluidCollabManager, IProvideRichTextEditor } from "./fluidCollabManager";

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

class ProseMirrorView implements IComponentHTMLView {
    private content: HTMLDivElement;
    private editorView: EditorView;
    private textArea: HTMLDivElement;
    public get IComponentHTMLView() { return this; }

    public constructor(private readonly collabManager: FluidCollabManager) {}

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        // Create base textarea
        if (!this.textArea) {
            this.textArea = document.createElement("div");
            this.textArea.classList.add("editor");
            this.content = document.createElement("div");
            this.content.style.display = "none";
            this.content.innerHTML = "";
        }

        // Reparent if needed
        if (this.textArea.parentElement !== elm) {
            this.textArea.remove();
            this.content.remove();
            elm.appendChild(this.textArea);
            elm.appendChild(this.content);
        }

        if (!this.editorView) {
            this.editorView = this.collabManager.setupEditor(this.textArea);
        }
    }

    public remove() {
        // Maybe implement this some time.
    }
}

/**
 * ProseMirror builds a fluid collaborative text editor on top of the open source text editor ProseMirror.
 * It has its own implementation of IComponentLoadable and does not extend SharedComponent / PrimedComponent. This is
 * done intentionally to serve as an example of exposing the URL and handle via IComponentLoadable.
 */
export class ProseMirror extends EventEmitter
    implements IComponentLoadable, IComponentRouter, IComponentHTMLVisual, IProvideRichTextEditor {
    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new ProseMirror(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get handle(): IComponentHandle<this> { return this.innerHandle; }

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLVisual() { return this; }
    public get IRichTextEditor() { return this.collabManager; }

    public url: string;
    public text: SharedString;
    private root: ISharedMap;
    private collabManager: FluidCollabManager;
    private view: ProseMirrorView;
    private readonly innerHandle: IComponentHandle<this>;

    constructor(
        private readonly runtime: IComponentRuntime,
        /* Private */ context: IComponentContext,
    ) {
        super();

        this.url = context.id;
        this.innerHandle = new ComponentHandle(this, this.url, runtime.IComponentHandleContext);
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

            this.root.set("text", text.handle);
            this.root.register();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
        this.text = await this.root.get<IComponentHandle<SharedString>>("text").get();

        this.collabManager = new FluidCollabManager(this.text, this.runtime.loader);

        // Access for debugging
        // eslint-disable-next-line dot-notation
        window["easyComponent"] = this;
    }

    public addView(): IComponentHTMLView {
        if (!this.view) {
            this.view = new ProseMirrorView(this.collabManager);
        }
        return this.view;
    }
}

class ProseMirrorFactory implements IComponentFactory {
    public static readonly type = "@chaincode/prosemirror";
    public readonly type = ProseMirrorFactory.type;

    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const mapFactory = SharedMap.getFactory();
        const sequenceFactory = SharedString.getFactory();

        dataTypes.set(mapFactory.type, mapFactory);
        dataTypes.set(sequenceFactory.type, sequenceFactory);

        const runtime = ComponentRuntime.load(
            context,
            dataTypes,
        );

        const proseMirrorP = ProseMirror.load(runtime, context);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const proseMirror = await proseMirrorP;
            return proseMirror.request(request);
        });
    }
}

export const fluidExport = new ProseMirrorFactory();
