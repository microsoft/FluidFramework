/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IComponentHTMLView, IComponentHTMLVisual } from "@microsoft/fluid-view-interfaces";
import { FlowDocument } from "../document";
import { FlowDocumentType, webflowType } from "../runtime";
import { WebflowView } from "./host";
import { importDoc } from "./import";

export class WebFlow extends PrimedComponent implements IComponentHTMLVisual {
    public get IComponentHTMLVisual() { return this; }

    // #region IComponentHTMLVisual
    public addView(scope?: IComponent): IComponentHTMLView {
        const componentHandle = this.root.get(this.docId);
        if (componentHandle) {
            return new WebflowView(componentHandle.get(), this.context.documentId);
        }
    }
    // #endregion IComponentHTMLVisual

    protected async componentInitializingFirstTime() {
        const component = await this.createAndAttachComponent<FlowDocument>(FlowDocumentType);
        this.docId = `${component.IComponentLoadable.url}`;
        this.root.set(this.docId, component.handle);
        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            importDoc(Promise.resolve(component), template);
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

export const webFlowFactory = new PrimedComponentFactory(
    webflowType,
    WebFlow,
    [],
    {},
    {},
    new Map([
        [FlowDocumentType, import(/* webpackChunkName: "flowdoc", webpackPreload: true */ "../document").then((m) => m.flowDocumentFactory)],
    ]));
