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
    IComponent,
    IComponentHTMLView,
} from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import { ISharedMap, SharedMap } from "@prague/map";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";
import { ISharedObjectFactory } from "@prague/shared-object-common";
import { initializeIcons } from '@uifabric/icons';
import { EventEmitter } from "events";
import { DrawerView } from "./drawerView";

export class Drawer extends EventEmitter implements IComponentLoadable, IComponentRouter, IComponentHTMLVisual {
    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new Drawer(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLVisual() { return this; }

    public url: string;
    private root: ISharedMap;
    private views = new Set<DrawerView>();

    constructor(private runtime: IComponentRuntime, context: IComponentContext) {
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
            this.root.register();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
    }

    public addView(scope?: IComponent): IComponentHTMLView {
        const view = new DrawerView(() => this.views.delete(view));
        this.views.add(view);

        return view;
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        throw new Error("Just addView please");
    }
}

class DrawerFactory implements IComponentFactory {
    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const mapFactory = SharedMap.getFactory();
        const sequenceFactory = SharedString.getFactory();

        dataTypes.set(mapFactory.type, mapFactory);
        dataTypes.set(sequenceFactory.type, sequenceFactory);

        initializeIcons();

        ComponentRuntime.load(
            context,
            dataTypes,
            (runtime) => {
                const progressCollectionP = Drawer.load(runtime, context);
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const progressCollection = await progressCollectionP;
                    return progressCollection.request(request);
                });
            });
    }
}

export const fluidExport = new DrawerFactory();

export function instantiateComponent(context: IComponentContext): void {
    fluidExport.instantiateComponent(context);
}
