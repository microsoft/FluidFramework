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
    IComponentHTMLView,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentReactViewable } from "@microsoft/fluid-aqueduct-react";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import {
    IMergeTreeInsertMsg,
    ReferenceType,
    reservedRangeLabelsKey,
    MergeTreeDeltaType,
    createMap,
} from "@microsoft/fluid-merge-tree";
import { 
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
    IProvideComponentRegistry,
    IComponentRegistry 
} from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { EventEmitter } from "events";
import { EditorView } from "prosemirror-view";
import { nodeTypeKey } from "./fluidBridge";
import { FluidCollabManager, IProvideRichTextEditor } from "./fluidCollabManager";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { Deferred } from "@microsoft/fluid-core-utils";

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
    private collabManager: FluidCollabManager;

    public constructor(
        private text: SharedString,
        private runtime: IComponentRuntime,
    ) {
        this.collabManager = new FluidCollabManager(this.text, this.runtime.loader);
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
            this.collabManager.setupEditor(this.textArea);
        }
    }

    public remove() {
        // Maybe implement this some time.
    }
}

export class ProseMirror
    extends EventEmitter
    implements IComponentLoadable,
    IComponentRouter,
    IComponentHTMLVisual,
    IProvideRichTextEditor,
    IComponentReactViewable {
    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new ProseMirror(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLVisual() { return this; }
    public get IRichTextEditor() { return this.collabManager; }
    public get IComponentReactViewable() { return this; }

    public url: string;
    public text: SharedString;
    private root: ISharedMap;
    private collabManager: FluidCollabManager;
    private defaultView: ProseMirrorView;
    public createJSXElement: () => JSX.Element
    private deferred: Deferred<void>;

    public ref: React.RefObject<HTMLDivElement>;
    public getRef: any;
    private refElem: HTMLDivElement;
    private jsxElem: JSX.Element;

    constructor(
        private runtime: IComponentRuntime,
        /* private */ context: IComponentContext,
    ) {
        super();
        this.deferred = new Deferred();
        this.url = context.id;

        this.createJSXElement = () => {
            if (!this.defaultView) {
                this.defaultView = new ProseMirrorView(this.text, this.runtime);
            }

            if (!this.jsxElem) {
                this.jsxElem = (
                    <div ref={this.getRef} />
                )

                this.deferred.promise.then(() => {
                    this.defaultView.render(this.refElem);
                });
            }

            return this.jsxElem;
        };

        this.ref = React.createRef<HTMLDivElement>();
        this.getRef = (elem) => {
            this.refElem = elem;
            this.deferred.resolve();
        }
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
        this.text = await this.root.get<IComponentHandle>("text").get<SharedString>();

        this.collabManager = new FluidCollabManager(this.text, this.runtime.loader);

        // access for debugging
        window["easyComponent"] = this;
    }

    public addView(): IComponentHTMLView {
        return new ProseMirrorView(this.text, this.runtime);
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        ReactDOM.render(
            this.createJSXElement(),
            elm,
        )
    }
}

class ProseMirrorFactory implements IComponentFactory, Partial<IProvideComponentRegistry>  {
    public get IComponentFactory() { return this; }

    public readonly onDemandInstantiation = false;

    private readonly sharedObjectRegistry: Map<string, ISharedObjectFactory>;
    private readonly registry: IComponentRegistry | undefined;

    constructor() {
        this.sharedObjectRegistry = new Map<string, ISharedObjectFactory>();
    }

    public instantiateComponent(context: IComponentContext): void {

        const mapFactory = SharedMap.getFactory();
        const sequenceFactory = SharedString.getFactory();

        this.sharedObjectRegistry.set(mapFactory.type, mapFactory);
        this.sharedObjectRegistry.set(sequenceFactory.type, sequenceFactory);

        ComponentRuntime.load(
            context,
            this.sharedObjectRegistry,
            (runtime) => {
                const proseMirrorP = ProseMirror.load(runtime, context);
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const proseMirror = await proseMirrorP;
                    return proseMirror.request(request);
                });
            });
    }

    public get IComponentRegistry() {
        return this.registry;
    }
}

export const fluidExport = new ProseMirrorFactory();
