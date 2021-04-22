/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { defaultFluidObjectRequestHandler } from "@fluidframework/aqueduct";
import {
    IFluidLoadable,
    IFluidRouter,
    IRequest,
    IResponse,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import {
    FluidObjectHandle,
    mixinRequestHandler,
} from "@fluidframework/datastore";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
    MergeTreeDeltaType,
    TextSegment,
    ReferenceType,
    reservedTileLabelsKey,
    Marker,
} from "@fluidframework/merge-tree";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { SharedString, SequenceDeltaEvent } from "@fluidframework/sequence";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
import CodeMirror from "codemirror";

/* eslint-disable @typescript-eslint/no-require-imports,
import/no-internal-modules, import/no-unassigned-import */
require("codemirror/lib/codemirror.css");
require("./style.css");
require("codemirror/mode/javascript/javascript.js");
/* eslint-enable @typescript-eslint/no-require-imports,
import/no-internal-modules, import/no-unassigned-import */

import { CodeMirrorPresenceManager } from "./presence";

class CodemirrorView implements IFluidHTMLView {
    private textArea: HTMLTextAreaElement | undefined;
    private codeMirror: CodeMirror.EditorFromTextArea | undefined;
    private presenceManager: CodeMirrorPresenceManager | undefined;

    // TODO would be nice to be able to distinguish local edits across different uses of a sequence so that when
    // bridging to another model we know which one to update
    private updatingSequence: boolean = false;
    private updatingCodeMirror: boolean = false;

    private sequenceDeltaCb: any;

    public get IFluidHTMLView() { return this; }

    constructor(private readonly text: SharedString, private readonly runtime: IFluidDataStoreRuntime) {
    }

    public remove(): void {
        // Text area being removed will dispose of CM
        // https://stackoverflow.com/questions/18828658/how-to-kill-a-codemirror-instance

        if (this.sequenceDeltaCb) {
            this.text.removeListener("sequenceDelta", this.sequenceDeltaCb);
            this.sequenceDeltaCb = undefined;
        }

        if (this.presenceManager) {
            this.presenceManager.removeAllListeners();
            this.presenceManager = undefined;
        }
    }

    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        // Create base textarea
        if (!this.textArea) {
            this.textArea = document.createElement("textarea");
        }

        // Reparent if needed
        if (this.textArea.parentElement !== elm) {
            this.textArea.remove();
            elm.appendChild(this.textArea);
        }

        if (!this.codeMirror) {
            this.setupEditor();
        }
    }

    private setupEditor() {
        this.codeMirror = CodeMirror.fromTextArea(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.textArea!,
            {
                lineNumbers: true,
                mode: "text/typescript",
                viewportMargin: Infinity,
            });

        this.presenceManager = new CodeMirrorPresenceManager(this.codeMirror, this.runtime);

        const { parallelText } = this.text.getTextAndMarkers("pg");
        const text = parallelText.join("\n");
        this.codeMirror.setValue(text);

        this.codeMirror.on(
            "beforeChange",
            (instance, changeObj) => {
                // Ignore this callback if it is a local change
                if (this.updatingSequence) {
                    return;
                }

                // Mark that our editor is making the edit
                this.updatingCodeMirror = true;

                const doc = instance.getDoc();

                // We add in line to adjust for paragraph markers
                let from = doc.indexFromPos(changeObj.from);
                const to = doc.indexFromPos(changeObj.to);

                if (from !== to) {
                    this.text.removeText(from, to);
                }

                const changeText = changeObj.text;
                changeText.forEach((value, index) => {
                    // Insert the updated text
                    if (value) {
                        this.text.insertText(from, value);
                        from += value.length;
                    }

                    // Add in a paragraph marker if this is a multi-line update
                    if (index !== changeText.length - 1) {
                        this.text.insertMarker(
                            from,
                            ReferenceType.Tile,
                            { [reservedTileLabelsKey]: ["pg"] });
                        from++;
                    }
                });

                this.updatingCodeMirror = false;
            });

        this.sequenceDeltaCb = (ev: SequenceDeltaEvent) => {
            // If in the middle of making an editor change to our instance we can skip this update
            if (this.updatingCodeMirror) {
                return;
            }

            // Mark that we are making a local edit so that when "beforeChange" fires we don't attempt
            // to submit new ops
            this.updatingSequence = true;

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const doc = this.codeMirror!.getDoc();
            for (const range of ev.ranges) {
                const segment = range.segment;

                if (range.operation === MergeTreeDeltaType.INSERT) {
                    if (TextSegment.is(segment)) {
                        doc.replaceRange(
                            segment.text,
                            doc.posFromIndex(range.position));
                    } else if (Marker.is(segment)) {
                        doc.replaceRange(
                            "\n",
                            doc.posFromIndex(range.position));
                    }
                } else if (range.operation === MergeTreeDeltaType.REMOVE) {
                    if (TextSegment.is(segment)) {
                        const textSegment = range.segment as TextSegment;
                        doc.replaceRange(
                            "",
                            doc.posFromIndex(range.position),
                            doc.posFromIndex(range.position + textSegment.text.length));
                    } else if (Marker.is(segment)) {
                        doc.replaceRange(
                            "",
                            doc.posFromIndex(range.position),
                            doc.posFromIndex(range.position + 1));
                    }
                }
            }

            // And then flip the bit back since we are done making codemirror changes
            this.updatingSequence = false;
        };

        this.text.on("sequenceDelta", this.sequenceDeltaCb);
    }
}

/**
 * CodeMirrorComponent builds a Fluid collaborative code editor on top of the open source code editor CodeMirror.
 * It has its own implementation of IFluidLoadable and does not extend PureDataObject / DataObject. This is
 * done intentionally to serve as an example of exposing the URL and handle via IFluidLoadable.
 */
export class CodeMirrorComponent
    extends EventEmitter
    implements IFluidLoadable, IFluidRouter, IFluidHTMLView {
    public static async load(runtime: IFluidDataStoreRuntime, context: IFluidDataStoreContext) {
        const collection = new CodeMirrorComponent(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IFluidLoadable() { return this; }
    public get IFluidRouter() { return this; }
    public get IFluidHTMLView() { return this; }

    public get handle(): IFluidHandle<this> { return this.innerHandle; }

    private text: SharedString | undefined;
    private root: ISharedMap | undefined;
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

            // Initial paragraph marker
            text.insertMarker(
                0,
                ReferenceType.Tile,
                { [reservedTileLabelsKey]: ["pg"] });

            this.root.set("text", text.handle);
            this.root.bindToContext();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
        this.text = await this.root.get<IFluidHandle<SharedString>>("text")?.get();
    }

    public render(elm: HTMLElement): void {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const codemirrorView = new CodemirrorView(this.text!, this.runtime);
        codemirrorView.render(elm);
    }
}

class SmdeFactory implements IFluidDataStoreFactory {
    public static readonly type = "@fluid-example/codemirror";
    public readonly type = SmdeFactory.type;

    public get IFluidDataStoreFactory() { return this; }

    public async instantiateDataStore(context: IFluidDataStoreContext) {
        const runtimeClass = mixinRequestHandler(
            async (request: IRequest) => {
                const router = await routerP;
                return router.request(request);
            });

        const runtime = new runtimeClass(context, new Map([
            SharedMap.getFactory(),
            SharedString.getFactory(),
        ].map((factory) => [factory.type, factory])));
        const routerP = CodeMirrorComponent.load(runtime, context);
        return runtime;
    }
}

export const fluidExport = new SmdeFactory();
