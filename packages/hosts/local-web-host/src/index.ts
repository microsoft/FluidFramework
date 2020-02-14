/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
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
import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { initializeContainerCode } from "@microsoft/fluid-base-host";

export async function createLocalContainerFactory(
    entryPoint: Partial<IProvideRuntimeFactory & IProvideComponentFactory & IFluidModule>,
): Promise<() => Promise<Container>> {

    const documentId = uuid();

    const urlResolver = new TestResolver(documentId);

    const deltaConn = TestDeltaConnectionServer.create();
    const documentServiceFactory = new TestDocumentServiceFactory(deltaConn);


    const factory: Partial<IProvideRuntimeFactory & IProvideComponentFactory> =
        entryPoint.fluidExport ? entryPoint.fluidExport : entryPoint;

    const runtimeFactory: IProvideRuntimeFactory =
        factory.IRuntimeFactory ?
            factory.IRuntimeFactory :
            new SimpleModuleInstantiationFactory("default", [["default", Promise.resolve(factory.IComponentFactory)]]);

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

    return async () => {

        const container = await loader.resolve({ url: documentId });

        await initializeContainerCode(container, {} as any as IFluidCodeDetails);

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

    // Check if the component is viewable
    const component = response.value as IComponent;
    // First try to get it as a view
    let renderable = component.IComponentHTMLView;
    if (!renderable) {
        // Otherwise get the visual, which is a view factory
        const visual = component.IComponentHTMLVisual;
        if (visual) {
            renderable = visual.addView();
        }
    }
    if (renderable) {
        renderable.render(div, { display: "block" });
    }
}
