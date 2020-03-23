/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-component-core-interfaces";
import { ClickerInstantiationFactory, Clicker } from "@fluid-example/clicker";

export class SimpleComponentEmbed extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private clicker: Clicker | undefined;

    /**
   * This is only run the first time a document is created
   * Here we will create a new embedded component. This can happen at any time
   * but in this scenario we only want it to be created once.
   */
    protected async componentInitializingFirstTime() {
        const component = await this.createAndAttachComponent_NEW("@fluid-example/clicker");
        this.root.set("myEmbeddedCounter", component.handle);
    }

    /**
   * Get Clicker component using ID from before
   */
    protected async componentHasInitialized() {
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

export const SimpleComponentEmbedInstantiationFactory = new PrimedComponentFactory(
    SimpleComponentEmbed,
    [],
);

export const fluidExport = new SimpleModuleInstantiationFactory(
    "@fluid-example/simple-component-embed",
    new Map([
        ["@fluid-example/simple-component-embed", Promise.resolve(SimpleComponentEmbedInstantiationFactory)],
        ["@fluid-example/clicker", Promise.resolve(ClickerInstantiationFactory)],
    ]),
);
