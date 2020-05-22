/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import {
    IComponent,
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
    IComponentHandle,
} from "@fluidframework/component-core-interfaces";
import { ComponentRuntime } from "@fluidframework/component-runtime";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
    MergeTreeDeltaType,
    TextSegment,
    ReferenceType,
    reservedTileLabelsKey,
    Marker,
} from "@fluidframework/merge-tree";
import { IComponentContext, IComponentFactory } from "@fluidframework/runtime-definitions";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { SharedString } from "@fluidframework/sequence";
import { ISharedObjectFactory } from "@fluidframework/shared-object-base";
import { IComponentHTMLOptions, IComponentHTMLView } from "@fluidframework/view-interfaces";
import * as SimpleMDE from "simplemde";
import { Viewer } from "./marked";

// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "simplemde/dist/simplemde.min.css";

export class Smde extends EventEmitter implements
    IComponentLoadable,
    IComponentRouter,
    IComponentHTMLView {
    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new Smde(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLView() { return this; }

    public url: string;
    private root: ISharedMap | undefined;
    private _text: SharedString | undefined;
    private textArea: HTMLTextAreaElement | undefined;
    private smde: SimpleMDE | undefined;

    private get text() {
        assert(this._text);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this._text!;
    }
    constructor(private readonly runtime: IComponentRuntime, private readonly context: IComponentContext) {
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
        this._text = await this.root.get<IComponentHandle<SharedString>>("text").get();
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        if (this.isReadonly()) {
            const viewer = new Viewer(elm, this.text);
            viewer.render();
        } else {
            // Create base textarea
            if (!this.textArea) {
                this.textArea = document.createElement("textarea");
            }

            // Reparent if needed
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
        const smde = new SimpleMDE({ element: this.textArea });
        this.smde = smde;

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
                            smde.codemirror.replaceRange(
                                segment.text,
                                smde.codemirror.posFromIndex(range.position));
                        } else if (Marker.is(segment)) {
                            smde.codemirror.replaceRange(
                                "\n",
                                smde.codemirror.posFromIndex(range.position));
                        }
                    } else if (range.operation === MergeTreeDeltaType.REMOVE) {
                        if (TextSegment.is(segment)) {
                            const textSegment = range.segment as TextSegment;
                            smde.codemirror.replaceRange(
                                "",
                                smde.codemirror.posFromIndex(range.position),
                                smde.codemirror.posFromIndex(range.position + textSegment.text.length));
                        } else if (Marker.is(segment)) {
                            smde.codemirror.replaceRange(
                                "",
                                smde.codemirror.posFromIndex(range.position),
                                smde.codemirror.posFromIndex(range.position + 1));
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

                // We add in line to adjust for paragraph markers
                let from = instance.doc.indexFromPos(changeObj.from);
                const to = instance.doc.indexFromPos(changeObj.to);

                if (from !== to) {
                    this.text.removeText(from, to);
                }

                // eslint-disable-next-line no-shadow
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
        const runtimeAsComponent = this.context.containerRuntime as IComponent;
        const scopes = runtimeAsComponent.IComponentConfiguration?.scopes;
        return scopes !== undefined && !scopes.includes("doc:write");
    }
}

class SmdeFactory implements IComponentFactory {
    public static readonly type = "@fluid-example/smde";
    public readonly type = SmdeFactory.type;

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

        const progressCollectionP = Smde.load(runtime, context);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const progressCollection = await progressCollectionP;
            return progressCollection.request(request);
        });
    }
}

export const fluidExport = new SmdeFactory();
