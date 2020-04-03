/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails, IFluidModule, IProvideRuntimeFactory } from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
import { createLocalLoader, initializeLocalContainer } from "@microsoft/fluid-local-loader-utils";
import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { HTMLViewAdapter } from "@microsoft/fluid-view-adapters";

export async function createLocalContainerFactory(
    entryPoint: Partial<IProvideRuntimeFactory & IProvideComponentFactory & IFluidModule>,
): Promise<() => Promise<Container>> {

    const documentId = uuid();
    const deltaConnectionServer = LocalDeltaConnectionServer.create();
    const loader = createLocalLoader(entryPoint, deltaConnectionServer, documentId);
    return async () => {
        return initializeLocalContainer(documentId, loader, {} as any as IFluidCodeDetails);
    };
}

export async function renderDefaultComponent(container: Container, div: HTMLElement) {
    const response = await container.request({ url:"" });

    if (response.status !== 200 ||
        !(
            response.mimeType === "fluid/component" ||
            response.mimeType === "prague/component"
        )) {
        div.innerText = "Component not found";
        return;
    }

    // Render the component with an HTMLViewAdapter to abstract the UI framework used by the component
    const component = response.value as IComponent;
    const embed = new HTMLViewAdapter(component);
    embed.render(div, { display: "block" });
}
