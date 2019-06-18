/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component } from "@prague/datastore";
import { MapExtension } from "@prague/map";
import { IChaincode } from "@prague/runtime-definitions";
import { FrameLoader } from "./frameLoader";

export class DOMStreamViewer extends Component {
    constructor() {
        // Register the collaborative types used by this document/component.
        super([[MapExtension.Type, new MapExtension()]]);
    }

    // Once document/component is opened, finish any remaining initialization required before the
    // document/component is returned to to the host.
    public async opened() {
        // If the host provided a <div>, display a minimal UI.
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
        if (maybeDiv) {
            // Create a <span> that displays the current value of 'clicks'.
            const iframe = document.createElement("iframe") as HTMLIFrameElement;
            FrameLoader.syncRoot(iframe, await this.root.getView());
            maybeDiv.appendChild(iframe);
        }
    }

    // Initialize the document/component (only called when document is initially created).
    protected async create() {
        // Do nothing
    }
}

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return Component.instantiate(new DOMStreamViewer());
}
