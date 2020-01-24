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
import { IResolvedPackage } from "@microsoft/fluid-web-code-loader";
import { DocumentFactory } from "./documentFactory";

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
        documentServiceFactory: new InnerDocumentServiceFactory(),
        urlResolver: new InnerUrlResolver(resolved),
        config,
        scope,
        proxyLoaderFactories: new Map<string, IProxyLoaderFactory>([["webworker", new WebWorkerLoaderFactory()]]),
    };

    const baseHost = new BaseHost(hostConf, resolved, pkg, scriptIds);
    const loader = await baseHost.getLoader();

    const documentFactory = new DocumentFactory(config.tenantId,
        config.moniker,
        config.url);

    documentFactory.resolveLoader(loader);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    await baseHost.loadAndRender(url, div, pkg ? pkg.details : undefined);
}
