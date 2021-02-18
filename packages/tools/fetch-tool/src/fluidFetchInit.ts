/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { URL } from "url";
import child_process from "child_process";
import { IFluidResolvedUrl, IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { configurableUrlResolver } from "@fluidframework/driver-utils";
import { FluidAppOdspUrlResolver } from "@fluid-internal/fluidapp-odsp-urlresolver";
import { IClientConfig, IOdspAuthRequestInfo } from "@fluidframework/odsp-doclib-utils";
import * as odsp from "@fluidframework/odsp-driver";
import { OdspUrlResolver } from "@fluidframework/odsp-urlresolver";
import * as r11s from "@fluidframework/routerlicious-driver";
import { RouterliciousUrlResolver } from "@fluidframework/routerlicious-urlresolver";
import { getMicrosoftConfiguration } from "@fluidframework/tool-utils";
import { localDataOnly, paramJWT } from "./fluidFetchArgs";
import { resolveWrapper } from "./fluidFetchSharePoint";

export let latestVersionsId: string = "";
export let connectionInfo: any;

export const fluidFetchWebNavigator = (url: string) => {
    let message = "Please open browser and navigate to this URL:";
    if (process.platform === "win32") {
        child_process.exec(`start "fluid-fetch" /B "${url}"`);
        message = "Opening browser to get authorization code.  If that doesn't open, please go to this URL manually";
    }
    console.log(`${message}\n  ${url}`);
};

async function initializeODSPCore(
    odspResolvedUrl: odsp.IOdspResolvedUrl,
    server: string,
    clientConfig: IClientConfig,
) {
    const { driveId, itemId } = odspResolvedUrl;

    connectionInfo = {
        server,
        drive: driveId,
        item: itemId,
    };

    if (localDataOnly) {
        return;
    }

    const docId = odsp.getHashedDocumentId(driveId, itemId);

    console.log(`Connecting to ODSP:
  server: ${server}
  drive:  ${driveId}
  item:   ${itemId}
  docId:  ${docId}`);

    const getStorageTokenStub = async (options: odsp.OdspResourceTokenFetchOptions) => {
        return resolveWrapper(
            async (authRequestInfo: IOdspAuthRequestInfo) => {
                if ((options.refresh || !authRequestInfo.accessToken) && authRequestInfo.refreshTokenFn) {
                    return authRequestInfo.refreshTokenFn();
                }
                return authRequestInfo.accessToken;
            },
            server,
            clientConfig,
            undefined,
            true,
        );
    };
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    const getWebsocketTokenStub = (_options: odsp.OdspResourceTokenFetchOptions) => Promise.resolve("");
    const odspDocumentServiceFactory = new odsp.OdspDocumentServiceFactory(
        getStorageTokenStub,
        getWebsocketTokenStub);
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

    // Latest version id is the documentId for r11s
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
    const tokenProvider = new r11s.DefaultTokenProvider(paramJWT);
    return r11s.createDocumentService(
        r11sResolvedUrl,
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
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        new RouterliciousUrlResolver(undefined, () => Promise.resolve(paramJWT), ""),
    ];
    const resolved = await configurableUrlResolver(resolversList, { url });
    return resolved;
}

export async function fluidFetchInit(urlStr: string) {
    const resolvedUrl = await resolveUrl(urlStr) as IFluidResolvedUrl;
    if (!resolvedUrl) {
        return Promise.reject(new Error(`Unknown URL ${urlStr}`));
    }
    const protocol = new URL(resolvedUrl.url).protocol;
    if (protocol === "fluid-odsp:") {
        const odspResolvedUrl = resolvedUrl as odsp.IOdspResolvedUrl;
        return initializeODSPCore(odspResolvedUrl, new URL(odspResolvedUrl.siteUrl).host, getMicrosoftConfiguration());
    } else if (protocol === "fluid:") {
        const url = new URL(urlStr);
        const server = url.hostname.toLowerCase();
        return initializeR11s(server, url.pathname, resolvedUrl);
    }
    return Promise.reject(new Error(`Unknown resolved protocol ${protocol}`));
}
