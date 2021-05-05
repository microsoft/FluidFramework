/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseHost,
    IBaseHostConfig,
} from "@fluidframework/base-host";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IProxyLoaderFactory, IResolvedFluidCodeDetails } from "@fluidframework/container-definitions";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { WebWorkerLoaderFactory } from "@fluidframework/execution-context-loader";
import {
    InnerDocumentServiceFactory,
    InnerUrlResolver,
} from "@fluidframework/iframe-driver";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { SemVerCdnCodeResolver } from "@fluidframework/web-code-loader";
import { DocumentFactory } from "./documentFactory";
import { seedFromScriptIds } from "./helpers";
import { debug } from "./debug";

async function getFluidObjectAndRender(baseHost: BaseHost, url: string, div: HTMLDivElement) {
    const fluidObject = await baseHost.requestFluidObject(url);
    if (fluidObject === undefined) {
        return;
    }

    // Render the Fluid object with an HTMLViewAdapter to abstract the UI framework used by the Fluid object
    const view = new HTMLViewAdapter(fluidObject);
    view.render(div, { display: "block" });
}

export async function initialize(
    url: string,
    resolved: IFluidResolvedUrl,
    pkg: IResolvedFluidCodeDetails | undefined,
    scriptIds: string[],
    config: any,
    clientId: string,
    scope: IFluidObject,
) {
    debug(`Loading ${url}`);

    const div = document.getElementById("content") as HTMLDivElement;

    const hostConf: IBaseHostConfig = {
        documentServiceFactory: await InnerDocumentServiceFactory.create(),
        urlResolver: new InnerUrlResolver(resolved),
        options: config,
        codeResolver: new SemVerCdnCodeResolver(),
        scope,
        proxyLoaderFactories: new Map<string, IProxyLoaderFactory>([["webworker", new WebWorkerLoaderFactory()]]),
    };

    const baseHost = new BaseHost(hostConf, seedFromScriptIds(pkg, scriptIds));
    const loader = await baseHost.getLoader();

    const documentFactory = new DocumentFactory(config.tenantId,
        config.moniker,
        config.url);

    documentFactory.resolveLoader(loader);

    const container = await baseHost.initializeContainer(url, pkg);

    // Currently this contextChanged handler covers both the initial load (from NullRuntime) as well as the upgrade
    // scenario.  In the next version of base-host it will only be for the upgrade scenario.
    container.on("contextChanged", (value) => {
        getFluidObjectAndRender(baseHost, url, div).catch(() => { });
    });
    await getFluidObjectAndRender(baseHost, url, div);
}
