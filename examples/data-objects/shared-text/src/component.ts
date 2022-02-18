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
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
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

export class SharedTextDataObject extends DataObject {
    public static get Name() { return "@fluid-example/shared-text"; }

    public static readonly factory = new DataObjectFactory(
        SharedTextDataObject.Name,
        SharedTextDataObject,
        [
            SharedString.getFactory(),
        ],
        {},
    );

    // It's generally not a good pattern to expose the runtime publicly -- here we do it for legacy reasons.
    public get exposedRuntime(): IFluidDataStoreRuntime {
        return this.runtime;
    }

    private _sharedString: SharedString;
    // It's also generally not a good pattern to expose raw data structures publicly.
    public get sharedString(): SharedString {
        return this._sharedString;
    }

    protected async initializingFirstTime() {
        this._sharedString = SharedString.create(this.runtime);
        this._sharedString.insertMarker(0, ReferenceType.Tile, { [reservedTileLabelsKey]: ["pg"] });
        this.root.set(textSharedStringId, this._sharedString.handle);
    }

    protected async hasInitialized() {
        this._sharedString = await this.root.get<IFluidHandle<SharedString>>(textSharedStringId).get();
    }
}

export const SharedTextDataStoreFactory = SharedTextDataObject.factory;
