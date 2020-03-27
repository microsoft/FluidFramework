/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHTMLView,
    IComponentHTMLVisual,
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentContext, IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { SharedComponentFactory, SharedComponent } from "@microsoft/fluid-component-base";
import { ISharedDirectory, SharedDirectory } from "@microsoft/fluid-map";
import { FlowDocument } from "../document";
import { hostType } from "../package";
import { WebflowView } from "./host";
import { importDoc } from "./import";

export class WebFlow extends SharedComponent<ISharedDirectory> implements IComponentHTMLVisual {
    private static readonly factory = new SharedComponentFactory<WebFlow>(
        hostType,
        WebFlow,
        /* root: */ SharedDirectory.getFactory(),
        [],
        [FlowDocument.getFactory()]);

    public static getFactory(): IComponentFactory { return WebFlow.factory; }

    public static create(parentContext: IComponentContext, props?: any) {
        return WebFlow.factory.create(parentContext, props);
    }

    public create() {
        const doc = FlowDocument.create(this.context);
        this.root.set("doc", doc.handle);

        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            importDoc(doc, template);
        }
    }

    public async load() { }

    public get IComponentHTMLVisual() { return this; }

    // #region IComponentHTMLVisual

    public addView(scope?: IComponent): IComponentHTMLView {
        return new WebflowView(this.root.get<IComponentHandle<FlowDocument>>("doc").get());
    }

    // #endregion IComponentHTMLVisual

    protected async componentInitializingFirstTime() { this.create(); }
}
