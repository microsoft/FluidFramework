/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { ClickerInstantiationFactory, Clicker } from "@fluid-example/clicker";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

const simpleComponentEmbedName = "@fluid-example/simple-component-embed";

export class SimpleComponentEmbed extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private clicker: Clicker | undefined;

    /**
   * This is only run the first time a document is created
   * Here we will create a new embedded component. This can happen at any time
   * but in this scenario we only want it to be created once.
   */
    protected async initializingFirstTime() {
        const component = await this.createAndAttachDataStore(ClickerInstantiationFactory.type);
        this.root.set("myEmbeddedCounter", component.handle);
    }

    /**
   * Get Clicker component using ID from before
   */
    protected async hasInitialized() {
        const handle = this.root.get("myEmbeddedCounter");
        this.clicker = await handle.get();
    }

    public render(div: HTMLDivElement) {
        // Create a div that we will use to embed the component
        // and attach that div to the page
        const componentDiv = document.createElement("div");
        componentDiv.id = "componentDiv";
        div.appendChild(componentDiv);

        // Then render the clicker in our div
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.clicker!.render(componentDiv);
    }
}

export const SimpleComponentEmbedInstantiationFactory = new DataObjectFactory(
    simpleComponentEmbedName,
    SimpleComponentEmbed,
    [],
    {},
);

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    SimpleComponentEmbedInstantiationFactory.type,
    new Map([
        SimpleComponentEmbedInstantiationFactory.registryEntry,
        ClickerInstantiationFactory.registryEntry,
    ]),
);
