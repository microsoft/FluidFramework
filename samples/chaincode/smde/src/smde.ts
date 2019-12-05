/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
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
import { EventEmitter } from "events";
import * as SimpleMDE from "simplemde";
import { Viewer } from "./marked";

import 'simplemde/dist/simplemde.min.css';

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
    private root: ISharedMap;
    private text: SharedString;
    private textArea: HTMLTextAreaElement;
    private smde: SimpleMDE;

    constructor(private runtime: IComponentRuntime, private context: IComponentContext) {
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
        if (this.isReadonly()) {
            const viewer = new Viewer(elm, this.text);
            viewer.render();
        } else {
            // create base textarea
            if (!this.textArea) {
                this.textArea = document.createElement("textarea");
            }

            // reparent if needed
            if (this.textArea.parentElement !== elm) {
                this.textArea.remove();
                elm.appendChild(this.textArea);
            }

            if (!this.smde) {
                this.setupEditor();
            }
        }
    }

    private setupEditor() {
        this.smde = new SimpleMDE({ element: this.textArea });

        const { parallelText } = this.text.getTextAndMarkers("pg");
        const text = parallelText.join("\n");
        this.smde.value(text);

        let localEdit = false;

        this.text.on(
            "sequenceDelta",
            (ev) => {
                if (ev.isLocal) {
                    return;
                }

                localEdit = true;
                for (const range of ev.ranges) {
                    const segment = range.segment;

                    if (range.operation === MergeTreeDeltaType.INSERT) {
                        if (TextSegment.is(segment)) {
                            // TODO need to count markers
                            this.smde.codemirror.replaceRange(
                                segment.text,
                                this.smde.codemirror.posFromIndex(range.position));
                        } else if (Marker.is(segment)) {
                            this.smde.codemirror.replaceRange(
                                "\n",
                                this.smde.codemirror.posFromIndex(range.position));
                        }
                    } else if (range.operation === MergeTreeDeltaType.REMOVE) {
                        if (TextSegment.is(segment)) {
                            const textSegment = range.segment as TextSegment;
                            this.smde.codemirror.replaceRange(
                                "",
                                this.smde.codemirror.posFromIndex(range.position),
                                this.smde.codemirror.posFromIndex(range.position + textSegment.text.length));
                        } else if (Marker.is(segment)) {
                            this.smde.codemirror.replaceRange(
                                "",
                                this.smde.codemirror.posFromIndex(range.position),
                                this.smde.codemirror.posFromIndex(range.position + 1));
                        }
                    }
                }
                localEdit = false;
            });

        this.smde.codemirror.on(
            "beforeChange",
            (instance, changeObj) => {
                if (localEdit) {
                    return;
                }

                // we add in line to adjust for paragraph markers
                let from = instance.doc.indexFromPos(changeObj.from);
                const to = instance.doc.indexFromPos(changeObj.to);

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

    // TODO: this should be an utility.
    private isReadonly() {
        const runtimeAsComponent = this.context.hostRuntime as IComponent;
        const scopes = runtimeAsComponent.IComponentConfiguration.scopes;
        return scopes !== undefined && !scopes.includes("doc:write");
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
