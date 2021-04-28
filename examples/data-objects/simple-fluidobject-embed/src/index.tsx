/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { ClickerInstantiationFactory, Clicker } from "@fluid-example/clicker";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

const simpleFluidObjectEmbedName = "@fluid-example/simple-fluidobject-embed";

export class SimpleFluidObjectEmbed extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private clicker: Clicker | undefined;

    /**
   * This is only run the first time a document is created
   * Here we will create a new embedded Fluid object. This can happen at any time
   * but in this scenario we only want it to be created once.
   */
    protected async initializingFirstTime() {
        const fluidObject = await ClickerInstantiationFactory.createChildInstance(this.context);
        this.root.set("myEmbeddedCounter", fluidObject.handle);
    }

    /**
   * Get Clicker using ID from before
   */
    protected async hasInitialized() {
        const handle = this.root.get("myEmbeddedCounter");
        this.clicker = await handle.get();
    }

    public render(div: HTMLDivElement) {
        // Create a div that we will use to embed the Fluid object
        // and attach that div to the page
        const fluidObjectDiv = document.createElement("div");
        fluidObjectDiv.id = "fluidObjectDiv";
        div.appendChild(fluidObjectDiv);

        // Then render the clicker in our div
        if (this.clicker !== undefined) {
            this.clicker.render(fluidObjectDiv);
        }
    }
}

export const SimpleFluidObjectEmbedInstantiationFactory =
    // eslint-disable-next-line @typescript-eslint/ban-types
    new DataObjectFactory<SimpleFluidObjectEmbed, undefined, undefined, IEvent>(
        simpleFluidObjectEmbedName,
        SimpleFluidObjectEmbed,
        [],
        {},
        new Map([
            ClickerInstantiationFactory.registryEntry,
        ]),
    );

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    SimpleFluidObjectEmbedInstantiationFactory,
    new Map([
        SimpleFluidObjectEmbedInstantiationFactory.registryEntry,
    ]),
);
