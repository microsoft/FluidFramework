/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { PrimedComponent, PrimedComponentFactory } from "@prague/aqueduct";
import {
    IComponent,
    IComponentHTMLOptions,
    IComponentHTMLView,
    IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import { FlowDocument } from "../document";
import { FlowDocumentType } from "../runtime";
import { WebflowView } from "./host";
import { importDoc } from "./import";

export class WebFlow extends PrimedComponent implements IComponentHTMLVisual {
    public constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    public get IComponentHTMLVisual() { return this; }

    // #region IComponentHTMLVisual
    public addView?(scope?: IComponent): IComponentHTMLView {
        return new WebflowView(this.getComponent<FlowDocument>(this.docId), this.context.documentId);
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        const view = this.addView();
        view.render(elm, options);
    }
    // #endregion IComponentHTMLVisual

    protected async componentInitializingFirstTime() {
        const docP = this.createAndAttachComponent<FlowDocument>(this.docId, FlowDocumentType);
        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            importDoc(docP, template);
        }
    }

    private get docId() { return `${this.runtime.id}-doc`; }
}

export const webFlowFactory = new PrimedComponentFactory(WebFlow, []);
