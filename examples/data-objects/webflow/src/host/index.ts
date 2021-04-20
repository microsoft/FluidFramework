/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { LazyLoadedDataObjectFactory, LazyLoadedDataObject } from "@fluidframework/data-object-base";
import { ISharedDirectory, SharedDirectory } from "@fluidframework/map";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { FlowDocument } from "../document";
import { hostType } from "../package";
import { WebflowView } from "./host";
import { importDoc } from "./import";

export class WebFlow extends LazyLoadedDataObject<ISharedDirectory> implements IFluidHTMLView {
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

        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            importDoc(doc, template);
        }
    }

    public async load() { }

    public get IFluidHTMLView() { return this; }

    // #region IFluidHTMLView

    public render(elm: HTMLElement): void {
        const view = new WebflowView(this.root.get<IFluidHandle<FlowDocument>>("doc").get());
        view.render(elm);
    }

    // #endregion IFluidHTMLView

    protected async initializingFirstTime() { await this.create(); }
}
