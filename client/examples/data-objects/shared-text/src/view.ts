/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import registerDebug from "debug";
import { performance } from "@fluidframework/common-utils";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import { controls, ui } from "./client-ui-lib";
import { SharedTextDataObject } from "./dataObject";

/* eslint-disable import/no-internal-modules, import/no-unassigned-import */
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/css/bootstrap-theme.min.css";
import "../stylesheets/map.css";
import "../stylesheets/style.css";
/* eslint-enable import/no-internal-modules, import/no-unassigned-import */

const debug = registerDebug("fluid:shared-text");

export class SharedTextView implements IFluidHTMLView {
    private uiInitialized = false;
    public get IFluidHTMLView() { return this; }

    public constructor(private readonly sharedTextDataObject: SharedTextDataObject) { }

    public render(element: HTMLElement) {
        if (this.uiInitialized) {
            return;
        }

        this.initializeUI(element).catch(debug);
        this.uiInitialized = true;
    }

    private async initializeUI(div): Promise<void> {
        const browserContainerHost = new ui.BrowserContainerHost();

        const containerDiv = document.createElement("div");
        containerDiv.classList.add("flow-container");
        const container = new controls.FlowContainer(
            containerDiv,
            "Shared Text",
            this.sharedTextDataObject.exposedRuntime,
            this.sharedTextDataObject.sharedString,
        );
        const theFlow = container.flowView;
        browserContainerHost.attach(container, div);

        theFlow.render(0, true);
        theFlow.timeToEdit = theFlow.timeToImpression = performance.now();

        theFlow.setEdit();

        this.sharedTextDataObject.sharedString.loaded.then(() => {
            theFlow.loadFinished(performance.now());
            debug(`${this.sharedTextDataObject.exposedRuntime.id} fully loaded: ${performance.now()} `);
        })
        .catch((e) => { console.error(e); });
    }
}
