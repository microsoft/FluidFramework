/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { isSpoTenant, resolveFluidUrl, spoGetResolvedUrl } from "@fluid-example/tiny-web-host";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { IFluidResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { IClientConfig } from "@microsoft/fluid-odsp-utils";
import { ScopeType } from "@microsoft/fluid-protocol-definitions";
import { IAlfredUser, RouterliciousUrlResolver } from "@microsoft/fluid-routerlicious-urlresolver";
import { IAlfredTenant, IGitCache } from "@microsoft/fluid-server-services-client";
import { chooseCelaName } from "@microsoft/fluid-server-services-core";
import { Request } from "express";
import { Provider } from "nconf";
import { v4 as uuid } from "uuid";
import { IAlfred } from "./interfaces";

interface FullTree {
    cache: IGitCache,
    code: IFluidCodeDetails | null,
}

export function resolveUrl(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    tenantId: string,
    documentId: string,
    scopes: ScopeType[],
    request: Request,
): [Promise<IFluidResolvedUrl>, Promise<undefined | FullTree>] {
    if (isSpoTenant(tenantId)) {
        const microsoftConfiguration = config.get("login:microsoft");
        const clientConfig: IClientConfig = {
            clientId: microsoftConfiguration.clientId,
            clientSecret: microsoftConfiguration.secret,
        };
        const resolvedP = spoGetResolvedUrl(tenantId, documentId,
            request.session?.tokens, clientConfig);
        const fullTreeP = Promise.resolve(undefined);
        return [resolvedP, fullTreeP];
    } else {
        let user: IAlfredUser | undefined;
        if ("cela" in request.query) {
            const celaName = chooseCelaName();
            user = { id: uuid(), name: celaName, displayName: celaName };
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        } else if (request.user) {
            user = {
                displayName: request.user.name,
                id: request.user.oid,
                name: request.user.name,
            };
        }

        const endPointConfig: { provider: Provider, tenantId: string, documentId: string } = {
            provider: config,
            tenantId,
            documentId,
        };

        const resolverList = [new RouterliciousUrlResolver(endPointConfig, undefined, appTenants, scopes, user)];
        const resolvedP = resolveFluidUrl(request, resolverList);
        const fullTreeP = alfred.getFullTree(tenantId, documentId);
        // RouterliciousUrlResolver only resolves as IFluidResolvedUrl
        return [resolvedP as Promise<IFluidResolvedUrl>, fullTreeP];
    }
}
