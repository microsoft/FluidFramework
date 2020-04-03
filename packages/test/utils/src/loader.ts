/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { initializeContainerCode } from "@microsoft/fluid-base-host";
import {
    IProxyLoaderFactory,
    ICodeLoader,
    ILoader,
    IProvideRuntimeFactory,
    IFluidModule,
    IFluidCodeDetails,
} from "@microsoft/fluid-container-definitions";
import { Loader, Container } from "@microsoft/fluid-container-loader";
import { TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { ILocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";

export function createLocalLoader(
    entryPoint: Partial<IProvideRuntimeFactory & IProvideComponentFactory & IFluidModule>,
    deltaConnectionServer: ILocalDeltaConnectionServer,
): ILoader {

    const urlResolver = new TestResolver();
    const documentServiceFactory = new TestDocumentServiceFactory(deltaConnectionServer);

    const factory: Partial<IProvideRuntimeFactory & IProvideComponentFactory> =
        entryPoint.fluidExport ?? entryPoint;
    const runtimeFactory: IProvideRuntimeFactory =
        factory.IRuntimeFactory ??
            new SimpleModuleInstantiationFactory("default", [["default", Promise.resolve(factory)]]);

    const codeLoader: ICodeLoader = {
        load: async <T>() => ({fluidExport: runtimeFactory} as unknown as T),
    };

    return new Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        {},
        {},
        new Map<string, IProxyLoaderFactory>());
}

export async function initializeLocalContainer(
    documentId: string,
    loader: ILoader,
    codeDetails: IFluidCodeDetails,
): Promise<Container> {

    const container = await loader.resolve({ url: documentId }) as unknown as Container;

    await initializeContainerCode(container, codeDetails);

    // If we're loading from ops, the context might be in the middle of reloading.  Check for that case and wait
    // for the contextChanged event to avoid returning before that reload completes.
    if (container.hasNullRuntime()) {
        await new Promise<void>((resolve) => container.once("contextChanged", () => resolve()));
    }

    return container;
}
