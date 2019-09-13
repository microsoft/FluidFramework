/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IHostConfig, start } from "@prague/base-host";
import { IResolvedPackage } from "@prague/loader-web";
import { OdspDocumentServiceFactory } from "@prague/odsp-socket-storage";
import { IDocumentServiceFactory, IResolvedUrl } from "@prague/protocol-definitions";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { IGitCache } from "@prague/services-client";

export function initialize(
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    pkg: IResolvedPackage,
    scriptIds: string[],
    npm: string,
    jwt: string,
    config: any,
) {

    const documentServiceFactories: IDocumentServiceFactory[] = [];
    documentServiceFactories.push(new OdspDocumentServiceFactory("Server-Gateway"));

    documentServiceFactories.push(new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true,
        cache));

    const resolver = new ContainerUrlResolver(
        document.location.origin,
        jwt,
        new Map<string, IResolvedUrl>([[url, resolved]]));

    const hostConf: IHostConfig = { documentServiceFactory: documentServiceFactories, urlResolver: resolver };

    console.log(`Loading ${url}`);
    const startP = start(
        url,
        resolved,
        pkg,
        scriptIds,
        npm,
        config,
        hostConf);

    startP.catch((err) => console.error(err));
}
