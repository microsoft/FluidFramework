/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidHTMLOptions,
    IFluidHTMLView,
} from "@fluidframework/view-interfaces";

class FauxComponentView implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    public render(parentEl: HTMLElement, options?: IFluidHTMLOptions) {
        const componentWrapper = document.createElement("div");
        componentWrapper.style.padding = "2pt 10pt";
        componentWrapper.style.background = "lightyellow";
        componentWrapper.style.margin = "2pt";
        const title = document.createElement("h1");
        title.innerText = "✨ Hello, host! ✨";
        componentWrapper.appendChild(title);
        parentEl.appendChild(componentWrapper);
    }
}

/** A placeholder data object used to render an HTML element when it is mounted by the host. */
class FauxComponent extends DataObject {
    public static readonly Factory = new DataObjectFactory(
        "FauxComponent",
        FauxComponent,
        [],
        {},
        [],
    );
}

const fauxComponentViewCallback = (model: FauxComponent) => new FauxComponentView();

export const fluidExport = new ContainerViewRuntimeFactory(FauxComponent.Factory, fauxComponentViewCallback);
