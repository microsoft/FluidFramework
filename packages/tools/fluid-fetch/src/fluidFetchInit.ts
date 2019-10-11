/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:object-literal-sort-keys
import { BaseTelemetryNullLogger, configurableUrlResolver } from "@microsoft/fluid-core-utils";
import { FluidAppOdspUrlResolver } from "@microsoft/fluid-fluidapp-odsp-urlresolver";
import * as odsp from "@microsoft/fluid-odsp-driver";
import { OdspUrlResolver } from "@microsoft/fluid-odsp-urlresolver";
import { IClientConfig, refreshAccessToken } from "@microsoft/fluid-odsp-utils";
import { IFluidResolvedUrl, IResolvedUrl, IUrlResolver } from "@microsoft/fluid-protocol-definitions";
import * as r11s from "@microsoft/fluid-routerlicious-driver";
import { RouterliciousUrlResolver } from "@microsoft/fluid-routerlicious-urlresolver";
import { URL } from "url";
import { localDataOnly, paramJWT } from "./fluidFetchArgs";
import { getClientConfig, getODSPTokens, saveAccessToken } from "./fluidFetchODSPTokens";

export let latestVersionsId: string = "";
export let connectionInfo: any;

async function initializeODSPCore(
    odspResolvedUrl: odsp.IOdspResolvedUrl,
    server: string,
    clientConfig: IClientConfig,
) {

    connectionInfo = {
        server,
        drive: odspResolvedUrl.driveId,
        item: odspResolvedUrl.itemId,
    };

    if (localDataOnly) {
        return;
    }

    console.log(`Connecting to ODSP:
  server: ${server}
  drive:  ${odspResolvedUrl.driveId}
  item:   ${odspResolvedUrl.itemId}`);

    const getStorageTokenStub = async (siteUrl: string, refresh: boolean) => {
        const tokens = await getODSPTokens(server, clientConfig, false);
        if (refresh || !tokens.accessToken) {
            // TODO: might want to handle if refresh failed and we want to reauth here.
            await refreshAccessToken(server, clientConfig, tokens);
            await saveAccessToken(server, tokens);
        }
        return tokens.accessToken;
    };
    const getWebsocketTokenStub = () => Promise.resolve("");
    const odspDocumentServiceFactory = new odsp.OdspDocumentServiceFactory(
        clientConfig.clientId,
        getStorageTokenStub,
        getWebsocketTokenStub,
        new BaseTelemetryNullLogger());
    return odspDocumentServiceFactory.createDocumentService(odspResolvedUrl);
}

async function initializeR11s(server: string, pathname: string, r11sResolvedUrl: IFluidResolvedUrl) {
    const path = pathname.split("/");
    let tenantId: string;
    let documentId: string;
    if (server === "localhost" && path.length < 4) {
        tenantId = "fluid";
        documentId = path[2];
    } else {
        tenantId = path[2];
        documentId = path[3];
    }

    // latest version id is the documentId for r11s
    latestVersionsId = documentId;

    connectionInfo = {
        server,
        tenantId,
        id: documentId,
    };

    if (localDataOnly) {
        return;
    }

    console.log(`Connecting to r11s: tenantId=${tenantId} id:${documentId}`);
    const tokenProvider = new r11s.TokenProvider(paramJWT);
    return r11s.createDocumentService(
        r11sResolvedUrl.endpoints.ordererUrl,
        r11sResolvedUrl.endpoints.deltaStorageUrl,
        r11sResolvedUrl.endpoints.storageUrl,
        tokenProvider,
        tenantId,
        documentId);
}

async function resolveUrl(url: string): Promise<IResolvedUrl | undefined> {

    const resolversList: IUrlResolver[] = [
        new OdspUrlResolver(),
        new FluidAppOdspUrlResolver(),
        new RouterliciousUrlResolver(undefined, () => Promise.resolve(paramJWT), []),
    ];
    const resolved = await configurableUrlResolver(resolversList, { url });
    return resolved;
}

export async function fluidFetchInit(urlStr: string) {
    const resolvedUrl = await resolveUrl(urlStr) as IFluidResolvedUrl;
    if (!resolvedUrl) {
        console.log(server);
        return Promise.reject(`Unknown URL ${paramURL}`);
    }
    const protocol = new URL(resolvedUrl.url).protocol;
    if (protocol === "fluid-odsp:") {
        const odspResolvedUrl = resolvedUrl as odsp.IOdspResolvedUrl;
        return initializeODSPCore(odspResolvedUrl, new URL(odspResolvedUrl.siteUrl).host, getClientConfig());
    } else if (protocol === "fluid:") {
        const url = new URL(urlStr);
        const server = url.hostname.toLowerCase();
        return initializeR11s(server, url.pathname, resolvedUrl);
    }
    return Promise.reject(`Unknown resolved protocol ${protocol}`);
}
