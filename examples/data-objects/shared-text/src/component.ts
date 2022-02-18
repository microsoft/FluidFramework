/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import registerDebug from "debug";
import { controls, ui } from "@fluid-example/client-ui-lib";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { performance } from "@fluidframework/common-utils";
import {
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import { ReferenceType, reservedTileLabelsKey } from "@fluidframework/merge-tree";
import {
    SharedString,
} from "@fluidframework/sequence";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/css/bootstrap-theme.min.css";
import "../stylesheets/map.css";
import "../stylesheets/style.css";

const debug = registerDebug("fluid:shared-text");

const textSharedStringId = "text";

export class SharedTextRunner extends DataObject implements IFluidHTMLView {
    public static get Name() { return "@fluid-example/shared-text"; }

    public static readonly factory = new DataObjectFactory(
        SharedTextRunner.Name,
        SharedTextRunner,
        [
            SharedString.getFactory(),
        ],
        {},
    );

    public get IFluidHTMLView() { return this; }

    private sharedString: SharedString;
    private uiInitialized = false;

    public render(element: HTMLElement) {
        if (this.uiInitialized) {
            return;
        }

        this.initializeUI(element).catch(debug);
        this.uiInitialized = true;
    }

    protected async initializingFirstTime() {
        this.sharedString = SharedString.create(this.runtime);
        this.sharedString.insertMarker(0, ReferenceType.Tile, { [reservedTileLabelsKey]: ["pg"] });
        this.root.set(textSharedStringId, this.sharedString.handle);
    }

    protected async hasInitialized() {
        this.sharedString = await this.root.get<IFluidHandle<SharedString>>(textSharedStringId).get();
    }

    private async initializeUI(div): Promise<void> {
        const browserContainerHost = new ui.BrowserContainerHost();

        const containerDiv = document.createElement("div");
        containerDiv.classList.add("flow-container");
        const container = new controls.FlowContainer(
            containerDiv,
            "Shared Text",
            this.runtime,
            this.sharedString,
        );
        const theFlow = container.flowView;
        browserContainerHost.attach(container, div);

        theFlow.render(0, true);
        theFlow.timeToEdit = theFlow.timeToImpression = performance.now();

        theFlow.setEdit();

        this.sharedString.loaded.then(() => {
            theFlow.loadFinished(performance.now());
            debug(`${this.runtime.id} fully loaded: ${performance.now()} `);
        })
        .catch((e) => { console.error(e); });
    }
}

export const SharedTextDataStoreFactory = SharedTextRunner.factory;
