/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { TestDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import {
    IProxyLoaderFactory,
    ICodeLoader,
    IProvideRuntimeFactory,
    IFluidModule,
} from "@microsoft/fluid-container-definitions";
import {  Loader, Container } from "@microsoft/fluid-container-loader";
import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";


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

        const quorum = container.getQuorum();

        const maybeContextChangedP = new Promise((resolve) => {
            if (!quorum.has("code")) {
                container.once("contextChanged", () => resolve());
            } else {
                resolve();
            }
        });

        if (!container.existing) {
            await quorum.propose("code", {});
        }

        await maybeContextChangedP;

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
    const viewable = component.IComponentHTMLVisual;

    if (viewable) {
        const renderable =
            viewable.addView ? viewable.addView() : viewable;

        renderable.render(div, { display: "block" });
        return;
    }
}
