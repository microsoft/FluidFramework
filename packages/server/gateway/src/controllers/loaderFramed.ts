/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseHost,
    IHostConfig,
} from "@microsoft/fluid-base-host";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IProxyLoaderFactory } from "@microsoft/fluid-container-definitions";
import { WebWorkerLoaderFactory } from "@microsoft/fluid-execution-context-loader";
import {
    InnerDocumentServiceFactory,
    InnerUrlResolver,
} from "@microsoft/fluid-iframe-driver";
import { IFluidResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import { IResolvedPackage } from "@microsoft/fluid-web-code-loader";
import { DocumentFactory } from "./documentFactory";

export async function initialize(
    url: string,
    resolved: IFluidResolvedUrl,
    pkg: IResolvedPackage,
    scriptIds: string[],
    config: any,
    clientId: string,
    scope: IComponent,
) {
    console.log(`Loading ${url}`);

    const div = document.getElementById("content") as HTMLDivElement;

    const hostConf: IHostConfig = {
        documentServiceFactory: new InnerDocumentServiceFactory(),
        urlResolver: new InnerUrlResolver(resolved),
    };

    const baseHost = new BaseHost(resolved, pkg, scriptIds, config, scope, hostConf,
        new Map<string, IProxyLoaderFactory>([["webworker", new WebWorkerLoaderFactory()]]));
    const loader = await baseHost.getLoader();

    const documentFactory = new DocumentFactory(config.tenantId,
        config.moniker,
        config.url);

    documentFactory.resolveLoader(loader);

    await baseHost.loadAndRender(url, div, pkg);
}
