/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import {
    IComponent,
    IComponentHandle,
} from "@fluidframework/component-core-interfaces";
import { IComponentContext } from "@fluidframework/runtime-definitions";
import { IComponentHTMLView, IComponentHTMLVisual } from "@fluidframework/view-interfaces";
import { FlowDocument } from "../document";
import { hostType } from "../package";
import { WebflowView } from "./host";
import { importDoc } from "./import";

export const WebFlowName = hostType;

export class WebFlow extends PrimedComponent implements IComponentHTMLVisual {
    private static readonly factory = new PrimedComponentFactory(
        WebFlowName,
        WebFlow,
        [],
        {},
        [FlowDocument.getFactory().registryEntry],
    );

    public static getFactory() { return WebFlow.factory; }

    public static async create(parentContext: IComponentContext) {
        return WebFlow.factory.createComponent(parentContext);
    }

    protected async componentInitializingFirstTime() {
        const doc = await FlowDocument.create(this.context) as FlowDocument;
        this.root.set("doc", doc.handle);

        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            importDoc(doc, template);
        }
    }

    public get IComponentHTMLVisual() { return this; }

    // #region IComponentHTMLVisual

    public addView(scope?: IComponent): IComponentHTMLView {
        return new WebflowView(this.root.get<IComponentHandle<FlowDocument>>("doc").get());
    }

    // #endregion IComponentHTMLVisual
}
