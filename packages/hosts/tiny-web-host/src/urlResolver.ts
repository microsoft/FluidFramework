/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClientConfig, IODSPTokens } from "@microsoft/fluid-odsp-utils";
import { generateToken, IAlfredTenant } from "@microsoft/fluid-server-services-core";
import { IFluidResolvedUrl, IUser, ScopeType } from "@prague/protocol-definitions";
import { parse } from "url";
import { getSpoServer, isSpoTenant, spoJoinSession } from "./odspUtils";

// tslint:disable: restrict-plus-operands prefer-template no-unsafe-any

export interface IConfig {
    clientId: string;
    secret: string;
    serverUrl: string;
    blobStorageUrl: string;
}

async function spoResolveUrl(
    config: IConfig,
    tenantId: string,
    documentId: string,
    getToken: () => Promise<string>) {

    const clientConfig: IClientConfig = {
        clientId: config.clientId,
        clientSecret: config.secret,
    };

    const odspToken: IODSPTokens = {
        accessToken: await getToken(),
        refreshToken: await getToken(),
    };

    const server = getSpoServer(tenantId);
    const tokens: { [server: string]: IODSPTokens } = {};
    tokens[server] = odspToken;

    const resolvedP = spoJoinSession(tenantId, documentId,
        tokens, clientConfig);
    const fullTreeP = Promise.resolve(undefined);
    return [resolvedP, fullTreeP];
}

function r11sResolveUrl(
    config: IConfig,
    appTenants: IAlfredTenant[],
    tenantId: string,
    documentId: string,
) {
    const user: IAlfredUser | undefined = undefined;

    const token = getR11sToken(tenantId, documentId, appTenants, user);

    const fluidUrl = "fluid://" +
        `${parse(config.serverUrl).host}/` +
        `${encodeURIComponent(tenantId)}/` +
        `${encodeURIComponent(documentId)}`;

    const deltaStorageUrl =
        config.serverUrl +
        "/deltas" +
        `/${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}`;

    const storageUrl =
        config.blobStorageUrl.replace("historian:3000", "localhost:3001");

    const resolvedUrl: IFluidResolvedUrl = {
        endpoints: {
            deltaStorageUrl,
            ordererUrl: config.serverUrl,
            storageUrl,
        },
        tokens: { jwt: token },
        type: "prague",
        url: fluidUrl,
    };
    const resolvedP = Promise.resolve(resolvedUrl);

    const fullTreeP = undefined; // TODO: Copy this logic: alfred.getFullTree(tenantId, documentId);
    return [resolvedP, fullTreeP];
}

export function resolveUrl(
    config: IConfig,
    appTenants: IAlfredTenant[],
    tenantId: string,
    documentId: string,
    getToken: () => Promise<string>,
) {
    if (isSpoTenant(tenantId)) {
        return spoResolveUrl(config, tenantId, `${documentId}`, getToken);
    } else {
        return r11sResolveUrl(config, /* alfred,*/ appTenants, tenantId, documentId);
    }
}

function getR11sToken(tenantId: string, documentId: string, tenants: IAlfredTenant[], user?: IAlfredUser): string {
    const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
    for (const tenant of tenants) {
        if (tenantId === tenant.id) {
            return generateToken(tenantId, documentId, tenant.key, scopes, user);
        }
    }

    throw new Error("Invalid tenant");
}

interface IAlfredUser extends IUser {
    displayName: string;
    name: string;
}
