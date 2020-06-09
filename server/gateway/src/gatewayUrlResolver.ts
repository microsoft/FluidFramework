/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { configurableUrlResolver } from "@fluidframework/driver-utils";
import { IClientConfig } from "@fluidframework/odsp-utils";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { IAlfredUser, RouterliciousUrlResolver } from "@fluidframework/routerlicious-urlresolver";
import { IAlfredTenant, IGitCache } from "@fluidframework/server-services-client";
import { chooseCelaName } from "@fluidframework/server-services-core";
import { Request } from "express";
import { Provider } from "nconf";
import { v4 as uuid } from "uuid";
import { IAlfred } from "./interfaces";
import { isSpoTenant, spoGetResolvedUrl } from "./odspUtils";

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
        const resolvedP = configurableUrlResolver(resolverList, request);
        const fullTreeP = alfred.getFullTree(tenantId, documentId);
        // RouterliciousUrlResolver only resolves as IFluidResolvedUrl
        return [resolvedP as Promise<IFluidResolvedUrl>, fullTreeP];
    }
}
