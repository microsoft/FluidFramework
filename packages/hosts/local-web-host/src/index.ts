/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { v4 as uuid } from "uuid";
import {
    IProxyLoaderFactory,
    ICodeLoader,
    IProvideRuntimeFactory,
    IFluidModule,
    IFluidCodeDetails,
} from "@microsoft/fluid-container-definitions";
import {  Loader, Container } from "@microsoft/fluid-container-loader";
import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { initializeContainerCode } from "@microsoft/fluid-base-host";
import { HTMLViewAdapter } from "@microsoft/fluid-view-adapters";

export async function createLocalContainerFactory(
    entryPoint: Partial<IProvideRuntimeFactory & IProvideComponentFactory & IFluidModule>,
): Promise<() => Promise<Container>> {

    const urlResolver = new TestResolver();

    const deltaConn = LocalDeltaConnectionServer.create();
    const documentServiceFactory = new TestDocumentServiceFactory(deltaConn);


    const factory: Partial<IProvideRuntimeFactory & IProvideComponentFactory> =
        entryPoint.fluidExport ? entryPoint.fluidExport : entryPoint;

    const runtimeFactory: IProvideRuntimeFactory =
        factory.IRuntimeFactory ?
            factory.IRuntimeFactory :
            new ContainerRuntimeFactoryWithDefaultComponent(
                "default",
                [["default", Promise.resolve(factory.IComponentFactory)]],
            );

    const codeLoader: ICodeLoader = {
        load: async <T>() => ({fluidExport: runtimeFactory} as unknown as T),
    };

    const loader =  new Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        {},
        {},
        new Map<string, IProxyLoaderFactory>());

    const documentId = uuid();
    const url = `fluid://localhost/${documentId}`;

    return async () => {

        const container = await loader.resolve({ url });

        await initializeContainerCode(container, {} as any as IFluidCodeDetails);

        // If we're loading from ops, the context might be in the middle of reloading.  Check for that case and wait
        // for the contextChanged event to avoid returning before that reload completes.
        if (container.hasNullRuntime()) {
            await new Promise<void>((resolve) => container.once("contextChanged", () => resolve()));
        }

        return container;
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
