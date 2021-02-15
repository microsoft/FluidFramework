/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 /* eslint-disable @typescript-eslint/no-non-null-assertion */

import { EventEmitter } from "events";
import { defaultFluidObjectRequestHandler } from "@fluidframework/aqueduct";
import {
    IFluidLoadable,
    IFluidRouter,
    IRequest,
    IResponse,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import { FluidObjectHandle, mixinRequestHandler } from "@fluidframework/datastore";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
    IMergeTreeInsertMsg,
    ReferenceType,
    reservedRangeLabelsKey,
    MergeTreeDeltaType,
    createMap,
} from "@fluidframework/merge-tree";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import { SharedString } from "@fluidframework/sequence";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
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

class ProseMirrorView implements IFluidHTMLView {
    private content: HTMLDivElement | undefined;
    private editorView: EditorView | undefined;
    private textArea: HTMLDivElement | undefined;
    public get IFluidHTMLView() { return this; }

    public constructor(private readonly collabManager: FluidCollabManager) { }

    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
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
            this.content!.remove();
            elm.appendChild(this.textArea);
            elm.appendChild(this.content!);
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
 * ProseMirror builds a Fluid collaborative text editor on top of the open source text editor ProseMirror.
 * It has its own implementation of IFluidLoadable and does not extend PureDataObject / DataObject. This is
 * done intentionally to serve as an example of exposing the URL and handle via IFluidLoadable.
 */
export class ProseMirror extends EventEmitter
    implements IFluidLoadable, IFluidRouter, IFluidHTMLView, IProvideRichTextEditor {
    public static async load(runtime: IFluidDataStoreRuntime, context: IFluidDataStoreContext) {
        const collection = new ProseMirror(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get handle(): IFluidHandle<this> { return this.innerHandle; }

    public get IFluidLoadable() { return this; }
    public get IFluidRouter() { return this; }
    public get IFluidHTMLView() { return this; }
    public get IRichTextEditor() { return this.collabManager!; }

    public text: SharedString | undefined;
    private root: ISharedMap | undefined;
    private collabManager: FluidCollabManager | undefined;
    private view: ProseMirrorView | undefined;
    private readonly innerHandle: IFluidHandle<this>;

    constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        /* Private */ context: IFluidDataStoreContext,
    ) {
        super();

        this.innerHandle = new FluidObjectHandle(this, "", runtime.objectsRoutingContext);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return defaultFluidObjectRequestHandler(this, request);
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            const text = SharedString.create(this.runtime);

            const ops = createTreeMarkerOps("prosemirror", 0, 1, "paragraph");
            text.groupOperation({ ops, type: MergeTreeDeltaType.GROUP });
            text.insertText(1, "Hello, world!");

            this.root.set("text", text.handle);
            this.root.bindToContext();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
        this.text = await this.root.get<IFluidHandle<SharedString>>("text")!.get();

        this.collabManager = new FluidCollabManager(this.text, this.runtime.loader);

        // Access for debugging
        // eslint-disable-next-line @typescript-eslint/dot-notation
        window["easyComponent"] = this;
    }

    public render(elm: HTMLElement): void {
        if (!this.view) {
            this.view = new ProseMirrorView(this.collabManager!);
        }
        this.view.render(elm);
    }
}

class ProseMirrorFactory implements IFluidDataStoreFactory {
    public static readonly type = "@fluid-example/prosemirror";
    public readonly type = ProseMirrorFactory.type;

    public get IFluidDataStoreFactory() { return this; }

    public async instantiateDataStore(context: IFluidDataStoreContext) {
        const dataTypes = new Map<string, IChannelFactory>();
        const mapFactory = SharedMap.getFactory();
        const sequenceFactory = SharedString.getFactory();

        dataTypes.set(mapFactory.type, mapFactory);
        dataTypes.set(sequenceFactory.type, sequenceFactory);

        const runtimeClass = mixinRequestHandler(
            async (request: IRequest) => {
                const router = await routerP;
                return router.request(request);
            });

        const runtime = new runtimeClass(context, dataTypes);
        const routerP = ProseMirror.load(runtime, context);

        return runtime;
    }
}

export const fluidExport = new ProseMirrorFactory();
