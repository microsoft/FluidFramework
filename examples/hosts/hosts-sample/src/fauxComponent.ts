/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidHTMLOptions,
    IFluidHTMLView,
} from "@fluidframework/view-interfaces";

/** A placeholder data object used to render an HTML element when it is mounted by the host. */
class FauxComponent extends DataObject implements IFluidHTMLView {
    private _componentEl: HTMLElement | undefined;
    public static readonly Factory = new DataObjectFactory(
        "FauxComponent",
        FauxComponent,
        [],
        {},
        [],
    );
    render(parentEl: HTMLElement, options?: IFluidHTMLOptions) {
        this._componentEl = document.createElement("div");
        this._componentEl.style.padding = "2pt 10pt";
        this._componentEl.style.background = "lightyellow";
        this._componentEl.style.margin = "2pt";
        const title = document.createElement("h1");
        title.innerText = "✨ Hello, host! ✨";
        this._componentEl.appendChild(title);
        parentEl.appendChild(this._componentEl);
    }
    get IFluidHTMLView() {
        return this;
    }
    dispose() {
        this._componentEl?.remove();
        super.dispose();
    }
}

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    FauxComponent.Factory,
    new Map([FauxComponent.Factory.registryEntry]),
);
