/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { LazyLoadedDataObjectFactory, LazyLoadedDataObject } from "@fluidframework/data-object-base";
import { ISharedDirectory, SharedDirectory } from "@fluidframework/map";
import { FlowDocument } from "../document";
import { hostType } from "../package";

export class WebFlow extends LazyLoadedDataObject<ISharedDirectory> {
    private static readonly factory = new LazyLoadedDataObjectFactory<WebFlow>(
        hostType,
        WebFlow,
        /* root: */ SharedDirectory.getFactory(),
        [],
        [FlowDocument.getFactory()]);

    public static getFactory(): IFluidDataStoreFactory { return WebFlow.factory; }

    public static async create(parentContext: IFluidDataStoreContext, props?: any) {
        return WebFlow.factory.create(parentContext, props);
    }

    public async create() {
        const doc = await FlowDocument.create(this.context) as FlowDocument;
        this.root.set("doc", doc.handle);
    }

    public async load() { }

    protected async initializingFirstTime() { await this.create(); }

    public async getFlowDocument() {
        return this.root.get<IFluidHandle<FlowDocument>>("doc").get();
    }
}
