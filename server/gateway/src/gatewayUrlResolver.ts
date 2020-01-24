/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { isSpoTenant, resolveFluidUrl, spoGetResolvedUrl } from "@fluid-example/tiny-web-host";
import { IClientConfig } from "@microsoft/fluid-odsp-utils";
import { ScopeType } from "@microsoft/fluid-protocol-definitions";
import { IAlfredUser, IConfig, RouterliciousUrlResolver } from "@microsoft/fluid-routerlicious-urlresolver";
import { chooseCelaName, IAlfredTenant } from "@microsoft/fluid-server-services-core";
import { Request } from "express";
import { Provider } from "nconf";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import { IAlfred } from "./interfaces";

export function resolveUrl(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    tenantId: string,
    documentId: string,
    scopes: ScopeType[],
    request: Request,
) {
    if (isSpoTenant(tenantId)) {
        const microsoftConfiguration = config.get("login:microsoft");
        const clientConfig: IClientConfig = {
            clientId: microsoftConfiguration.clientId,
            clientSecret: microsoftConfiguration.secret,
        };
        const resolvedP = spoGetResolvedUrl(tenantId, documentId,
            request.session.tokens, clientConfig);
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
        const endPointConfig: IConfig = {
            blobStorageUrl: config.get("worker:blobStorageUrl"),
            serverUrl: config.get("worker:serverUrl"),
            tenantId,
            documentId,
        };
        const resolverList = [new RouterliciousUrlResolver(endPointConfig, undefined, appTenants, scopes, user)];
        const resolvedP = resolveFluidUrl(request.originalUrl, resolverList);
        const fullTreeP = alfred.getFullTree(tenantId, documentId);
        return [resolvedP, fullTreeP];
    }
}
