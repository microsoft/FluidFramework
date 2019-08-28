/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { createWebLoader, initializeChaincode, registerAttach } from "@prague/base-host";
import { IComponent } from "@prague/component-core-interfaces";
import { IResolvedPackage } from "@prague/loader-web";
import { IResolvedUrl } from "@prague/protocol-definitions";
import { IGitCache } from "@prague/services-client";
import { DocumentFactory } from "./documentFactory";
import { IHostServices } from "./services";

export async function initialize(
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    pkg: IResolvedPackage,
    scriptIds: string[],
    npm: string,
    jwt: string,
    config: any,
    scope: IComponent,
) {
    const documentFactory = new DocumentFactory(config.tenantId);

    const services: IHostServices = {
        IDocumentFactory: documentFactory,
    };

    console.log(`Loading ${url}`);
    const loader = createWebLoader(
        url,
        resolved,
        cache,
        pkg,
        scriptIds,
        npm,
        jwt,
        config,
        services);
    documentFactory.resolveLoader(loader);

    const div = document.getElementById("content") as HTMLDivElement;
    const container = await loader.resolve({ url });

    registerAttach(loader, container, url, div);

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!container.existing) {
        await initializeChaincode(container, pkg);
    }
}
