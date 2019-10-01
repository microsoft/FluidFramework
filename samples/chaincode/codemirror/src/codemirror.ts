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
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { MergeTreeDeltaType, TextSegment, ReferenceType, reservedTileLabelsKey, Marker } from "@microsoft/fluid-merge-tree";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import * as CodeMirror from "codemirror";
import { EventEmitter } from "events";

require("codemirror/lib/codemirror.css");
require("./style.css");

require("codemirror/mode/javascript/javascript.js");

export class Smde extends EventEmitter implements IComponentLoadable, IComponentRouter, IComponentHTMLVisual {
    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new Smde(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLVisual() { return this; }

    public url: string;
    private text: SharedString;
    private root: ISharedMap;
    private textArea: HTMLTextAreaElement;
    private codeMirror: CodeMirror.EditorFromTextArea;

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

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        // create base textarea
        if (!this.textArea) {
            this.textArea = document.createElement("textarea");
        }

        // reparent if needed
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

        const { parallelText } = this.text.getTextAndMarkers("pg");
        const text = parallelText.join("\n");
        this.codeMirror.setValue(text);

        let localEdit = false;

        this.text.on(
            "sequenceDelta",
            (ev) => {
                if (ev.isLocal) {
                    return;
                }

                const doc = this.codeMirror.getDoc();
                localEdit = true;
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
                localEdit = false;
            });

        this.codeMirror.on(
            "beforeChange",
            (instance, changeObj) => {
                if (localEdit) {
                    return;
                }

                const doc = instance.getDoc();

                // we add in line to adjust for paragraph markers
                let from = doc.indexFromPos(changeObj.from);
                const to = doc.indexFromPos(changeObj.to);

                if (from !== to) {
                    this.text.removeText(from, to);
                }

                const text = changeObj.text as string[];
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
            });
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
                const progressCollectionP = Smde.load(runtime, context);
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const progressCollection = await progressCollectionP;
                    return progressCollection.request(request);
                });
            });
    }
}

export const fluidExport = new SmdeFactory();
