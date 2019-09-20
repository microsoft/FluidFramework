/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClientConfig } from "@microsoft/fluid-odsp-utils";
import { IFluidResolvedUrl, ScopeType } from "@microsoft/fluid-protocol-definitions";
import { chooseCelaName, IAlfredTenant } from "@microsoft/fluid-server-services-core";
import { Request } from "express";
import { Provider } from "nconf";
import { parse } from "url";
// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";
import { isSpoTenant, spoJoinSession } from "./gateway-odsp-utils";
import { IAlfred } from "./interfaces";
import { getToken, IAlfredUser } from "./utils";

function spoResolveUrl(
    config: Provider,
    tenantId: string,
    documentId: string,
    request: Request) {

    const microsoftConfiguration = config.get("login:microsoft");
    const clientConfig: IClientConfig = {
        clientId: microsoftConfiguration.clientId,
        clientSecret: microsoftConfiguration.secret,
    };
    const resolvedP = spoJoinSession(tenantId, documentId,
        request.session.tokens, clientConfig);
    const fullTreeP = Promise.resolve(undefined);
    return [resolvedP, fullTreeP];
}

function r11sResolveUrl(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    tenantId: string,
    documentId: string,
    scopes: ScopeType[],
    request: Request,
) {
    let user: IAlfredUser | undefined;
    if ("cela" in request.query) {
        const celaName = chooseCelaName();
        user = { id: uuid(), name: celaName, displayName: celaName };
    } else if (request.user) {
        user = {
            displayName: request.user.name,
            id: request.user.oid,
            name: request.user.name,
        };
    }

    const token = getToken(tenantId, documentId, appTenants, scopes, user);

    const fluidUrl = "fluid://" +
        `${parse(config.get("worker:serverUrl")).host}/` +
        `${encodeURIComponent(tenantId)}/` +
        `${encodeURIComponent(documentId)}`;

    const deltaStorageUrl =
        config.get("worker:serverUrl") +
        "/deltas" +
        `/${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}`;

    const storageUrl =
        config.get("worker:blobStorageUrl").replace("historian:3000", "localhost:3001") +
        "/repos" +
        `/${encodeURIComponent(tenantId)}`;

    const resolvedUrl: IFluidResolvedUrl = {
        endpoints: {
            deltaStorageUrl,
            ordererUrl: config.get("worker:serverUrl"),
            storageUrl,
        },
        tokens: { jwt: token },
        type: "fluid",
        url: fluidUrl,
    };
    const resolvedP = Promise.resolve(resolvedUrl);

    const fullTreeP = alfred.getFullTree(tenantId, documentId);
    return [resolvedP, fullTreeP];
}

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
        return spoResolveUrl(config, tenantId, `${documentId}`, request);
    } else {
        return r11sResolveUrl(config, alfred, appTenants, tenantId, documentId, scopes, request);
    }
}
