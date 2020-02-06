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
    IComponentHTMLOptions,
    IComponentHTMLVisual,
    IComponentHandle,
    IComponent,
    IComponentHTMLView,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import {
    MergeTreeDeltaType,
    TextSegment,
    ReferenceType,
    reservedTileLabelsKey,
    Marker,
} from "@microsoft/fluid-merge-tree";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SharedString, SequenceDeltaEvent } from "@microsoft/fluid-sequence";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import * as CodeMirror from "codemirror";

/* eslint-disable @typescript-eslint/no-require-imports,
import/no-internal-modules, import/no-unassigned-import */
require("codemirror/lib/codemirror.css");
require("./style.css");
require("codemirror/mode/javascript/javascript.js");
/* eslint-enable @typescript-eslint/no-require-imports,
import/no-internal-modules, import/no-unassigned-import */

import { CodeMirrorPresenceManager } from "./presence";

class CodemirrorView implements IComponentHTMLView {
    private textArea: HTMLTextAreaElement;
    private codeMirror: CodeMirror.EditorFromTextArea;
    private presenceManager: CodeMirrorPresenceManager;

    // TODO would be nice to be able to distinguish local edits across different uses of a sequence so that when
    // bridging to another model we know which one to update
    private updatingSequence: boolean;
    private updatingCodeMirror: boolean;

    private sequenceDeltaCb: any;

    constructor(private readonly text: SharedString, private readonly runtime: IComponentRuntime) {
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

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
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
            this.textArea,
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

                // eslint-disable-next-line no-shadow
                const text = changeObj.text;
                text.forEach((value, index) => {
                    // Insert the updated text
                    if (value) {
                        this.text.insertText(from, value);
                        from += value.length;
                    }

                    // Add in a paragraph marker if this is a multi-line update
                    if (index !== text.length - 1) {
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

            const doc = this.codeMirror.getDoc();
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

export class CodeMirrorComponent
    extends EventEmitter
    implements IComponentLoadable, IComponentRouter, IComponentHTMLView, IComponentHTMLVisual {

    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new CodeMirrorComponent(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLVisual() { return this; }

    public url: string;
    private text: SharedString;
    private root: ISharedMap;

    private defaultView: CodemirrorView;

    constructor(
        private readonly runtime: IComponentRuntime,
        /* Private */ context: IComponentContext,
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

            // Initial paragraph marker
            text.insertMarker(
                0,
                ReferenceType.Tile,
                { [reservedTileLabelsKey]: ["pg"] });

            this.root.set("text", text.handle);
            this.root.register();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
        this.text = await this.root.get<IComponentHandle>("text").get<SharedString>();
    }

    public addView(scope: IComponent): IComponentHTMLView {
        return new CodemirrorView(this.text, this.runtime);
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        if (!this.defaultView) {
            this.defaultView = new CodemirrorView(this.text, this.runtime);
        }

        this.defaultView.render(elm, options);
    }
}

class SmdeFactory implements IComponentFactory {
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
                const progressCollectionP = CodeMirrorComponent.load(runtime, context);
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const progressCollection = await progressCollectionP;
                    return progressCollection.request(request);
                });
            });
    }
}

export const fluidExport = new SmdeFactory();
