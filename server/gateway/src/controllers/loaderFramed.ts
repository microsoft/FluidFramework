/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseHost,
    IBaseHostConfig,
} from "@microsoft/fluid-base-host";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IProxyLoaderFactory } from "@microsoft/fluid-container-definitions";
import { IFluidResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { WebWorkerLoaderFactory } from "@microsoft/fluid-execution-context-loader";
import {
    InnerDocumentServiceFactory,
    InnerUrlResolver,
} from "@microsoft/fluid-iframe-driver";
import { HTMLViewAdapter } from "@microsoft/fluid-view-adapters";
import { IResolvedPackage } from "@microsoft/fluid-web-code-loader";
import { DocumentFactory } from "./documentFactory";

async function getComponentAndRender(baseHost: BaseHost, url: string, div: HTMLDivElement) {
    const component = await baseHost.getComponent(url);
    if (component === undefined) {
        return;
    }

    // Render the component with an HTMLViewAdapter to abstract the UI framework used by the component
    const view = new HTMLViewAdapter(component);
    view.render(div, { display: "block" });
}

export async function initialize(
    url: string,
    resolved: IFluidResolvedUrl,
    pkg: IResolvedPackage | undefined,
    scriptIds: string[],
    config: any,
    clientId: string,
    scope: IComponent,
) {
    console.log(`Loading ${url}`);

    const div = document.getElementById("content") as HTMLDivElement;

    const hostConf: IBaseHostConfig = {
        documentServiceFactory: await InnerDocumentServiceFactory.create(),
        urlResolver: new InnerUrlResolver(resolved),
        config,
        scope,
        proxyLoaderFactories: new Map<string, IProxyLoaderFactory>([["webworker", new WebWorkerLoaderFactory()]]),
    };

    const baseHost = new BaseHost(hostConf, pkg, scriptIds);
    const loader = await baseHost.getLoader();

    const documentFactory = new DocumentFactory(config.tenantId,
        config.moniker,
        config.url);

    documentFactory.resolveLoader(loader);

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const container = await baseHost.initializeContainer(url, pkg ? pkg.details : undefined);

    // Currently this contextChanged handler covers both the initial load (from NullRuntime) as well as the upgrade
    // scenario.  In the next version of base-host it will only be for the upgrade scenario.
    container.on("contextChanged", (value) => {
        getComponentAndRender(baseHost, url, div).catch(() => { });
    });
    await getComponentAndRender(baseHost, url, div);
}
