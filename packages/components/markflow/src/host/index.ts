/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHTMLOptions,
    IComponentHTMLView,
    IComponentHTMLVisual,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { FlowDocument } from "../document";
import { FlowDocumentType } from "../runtime";
import { WebflowView } from "./host";
import { importDoc } from "./import";

export class WebFlow extends PrimedComponent implements IComponentHTMLView, IComponentHTMLVisual {
    public constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    public get IComponentHTMLVisual() { return this; }

    // #region IComponentHTMLVisual
    public addView(scope?: IComponent): IComponentHTMLView {
        return new WebflowView(this.getComponent<FlowDocument>(this.docId), this.context.documentId);
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        const view = new WebflowView(this.getComponent<FlowDocument>(this.docId), this.context.documentId);
        view.render(elm, options);
    }
    // #endregion IComponentHTMLVisual

    protected async componentInitializingFirstTime() {
        const componentRuntime: IComponentRuntime = await this.context.createComponent(FlowDocumentType);
        const response: IResponse = await componentRuntime.request({ url: "/" });
        componentRuntime.attach();
        this.docId = `${componentRuntime.id}`;
        const doc = response.value as FlowDocument;
        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            importDoc(Promise.resolve(doc), template);
        }
    }

    private get docId() {
        const componentId = this.root.get("docId");
        // For backward compatibility, if the component id is not stored on the root, then we get the component id
        // the way it was stored in previous version.
        if (!componentId) {
            return `${this.runtime.id}-doc`;
        }
        return componentId;
    }

    private set docId(id: string) {
        this.root.set("docId", id);
    }
}

export const webFlowFactory = new PrimedComponentFactory(WebFlow, [], new Map([
    [FlowDocumentType, import(/* webpackChunkName: "flowdoc", webpackPreload: true */ "../document").then((m) => m.flowDocumentFactory)],
]));
