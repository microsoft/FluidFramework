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
} from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import { ISharedMap, SharedMap } from "@prague/map";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";
import { ISharedObjectFactory } from "@prague/shared-object-common";
import { EventEmitter } from "events";
import * as SimpleMDE from "simplemde";

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

    constructor(private runtime: IComponentRuntime, context: IComponentContext) {
        super();

        this.url = context.id;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            const text = SharedString.create(this.runtime);
            this.root.set("text", text);

            this.root.register();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
        this.text = this.root.get("text");
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

        if (!this.smde) {
            this.setupEditor();
        }
    }

    private setupEditor() {
        this.smde = new SimpleMDE({ element: this.textArea });
        this.smde.value(this.text.getText());

        let localEdit = false;

        this.text.on(
            "sequenceDelta",
            (ev) => {
                if (ev.isLocal) {
                    return;
                }

                localEdit = true;
                this.smde.value(this.text.getText());
                localEdit = false;
            });

        this.smde.codemirror.on(
            "change",
            (instance, changeObj) => {
                if (localEdit) {
                    return;
                }

                const from = instance.doc.indexFromPos(changeObj.from);
                this.text.insertText(from, changeObj.text[0]);
                // 
                // instance.doc.indexFromPos(changeObj.to)
                // console.log(changeObj);
                // changeObj.text;
                // changeObj.removed;
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

export function instantiateComponent(context: IComponentContext): void {
    fluidExport.instantiateComponent(context);
}
