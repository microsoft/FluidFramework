/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse, UrlWithStringQuery } from "url";
import { IResolvedUrl, IWebResolvedUrl } from "@fluidframework/driver-definitions";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { IAlfredUser } from "@fluidframework/routerlicious-urlresolver";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import Axios from "axios";
import { Request, Router } from "express";
import safeStringify from "json-stringify-safe";
import moniker from "moniker";
import { Provider } from "nconf";
import passport from "passport";
import winston from "winston";
import { getR11sToken, IJWTClaims } from "../../utils";

interface IFluidUrlParts {
    tenantId: string;
    documentId: string;
    path: string;
}

function extractFluidUrlParts(url: UrlWithStringQuery): IFluidUrlParts | undefined {
    const regex = url.protocol === "fluid:"
        ? /^\/([^/]*)\/([^/]*)(\/?.*)$/
        : /^\/loader\/([^/]*)\/([^/]*)(\/?.*)$/;
    // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec, @typescript-eslint/no-non-null-assertion
    const match = url.path!.match(regex);

    if (!match) {
        return undefined;
    }

    const marker = match[2].indexOf("?");
    const documentId = match[2].substring(0, marker !== -1 ? marker : match[2].length);
    return {
        tenantId: match[1],
        documentId,
        path: match[3],
    };
}

// Although probably the case we want a default behavior here. Maybe just the URL?
async function getWebComponent(url: UrlWithStringQuery): Promise<IWebResolvedUrl> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = await Axios.get(url.href!);

    return {
        data: result.data,
        type: "web",
    };
}

// Resolves from other Fluid endpoints.
async function getExternalComponent(
    request: Request,
    hostUrl: string,
    requestUrl: string,
    scopes: ScopeType[]): Promise<IResolvedUrl> {
    winston.info(`Requesting ${requestUrl} to ${hostUrl}`);
    const result = await Axios.post<IResolvedUrl>(
        hostUrl,
        {
            scopes,
            url: requestUrl,
        },
        {
            headers: {
                // We probably want to sign this bearer token with endpoint specific secret key
                Authorization: request.header("Authorization"),
            },
        });
    return result.data;
}

async function getInternalComponent(
    request: Request,
    config: Provider,
    url: UrlWithStringQuery,
    appTenants: IAlfredTenant[],
    scopes: ScopeType[],
): Promise<IResolvedUrl> {
    const urlParts = extractFluidUrlParts(url);

    if (!urlParts) {
        return getWebComponent(url);
    }
    const internalGateway = parse(config.get("worker:gatewayUrl"));
    const internal = internalGateway.host === url.host;

    const tenantId = urlParts.tenantId;
    const safeTenantId = encodeURIComponent(tenantId);
    const documentId = urlParts.documentId;
    const path = urlParts.path;

    const orderer = internal ? config.get("worker:alfredUrl") : config.get("worker:serverUrl");

    const user: IAlfredUser = (request.user as IJWTClaims).user;

    const token = getR11sToken(tenantId, documentId, appTenants, scopes, user);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const fluidUrl = `fluid://${url.host}/${tenantId}/${documentId}${path}${url.hash ? url.hash : ""}`;

    const deltaStorageUrl =
        `${orderer}/deltas/${safeTenantId}/${encodeURIComponent(documentId)}`;

    const storageUrl =
        `${internal ?
            config.get("worker:internalBlobStorageUrl") :
            config.get("worker:blobStorageUrl").replace("historian:3000", "localhost:3001")}/repos/${safeTenantId}`;

    return {
        endpoints: {
            deltaStorageUrl,
            ordererUrl: orderer,
            storageUrl,
        },
        tokens: { jwt: token },
        type: "fluid",
        url: fluidUrl,
    };
}

// Checks whether the url belongs to other Fluid endpoints.
const isExternalComponent = (url: string, endpoints: string[]) => endpoints.includes(url);

export function create(
    config: Provider,
    appTenants: IAlfredTenant[],
): Router {
    const router: Router = Router();

    const gateway = parse(config.get("gateway:url"));
    const alfred = parse(config.get("worker:serverUrl"));
    const internalGateway = parse(config.get("worker:gatewayUrl"));
    const federatedEndpoints = config.get("gateway:federation:endpoints") as string[];

    router.post("/load", passport.authenticate("jwt", { session: false }), (request, response) => {
        const url = parse(request.body.url);
        const urlPrefix = `${url.protocol}//${url.host}`;
        let scopes: ScopeType[];
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (request.body.scopes) {
            scopes = request.body.scopes;
        } else {
            scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        }

        const resultP = (alfred.host === url.host || gateway.host === url.host || internalGateway.host === url.host)
            ? getInternalComponent(request, config, url, appTenants, scopes)
            : isExternalComponent(urlPrefix, federatedEndpoints)
                ? getExternalComponent(request, `${urlPrefix}/api/v1/load`, request.body.url as string, scopes)
                : getWebComponent(url);

        resultP.then(
            (result) => response.status(200).json(result),
            (error) => response.status(400).end(safeStringify(error)));
    });

    router.post("/token", passport.authenticate("jwt", { session: false }), (request, response) => {
        const user: IAlfredUser = (request.user as IJWTClaims).user;
        const url = parse(request.body.url);

        let scopes: ScopeType[];
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (request.body.scopes) {
            scopes = request.body.scopes;
        } else {
            scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        }

        const urlParts = extractFluidUrlParts(url);
        if (!urlParts) {
            response.status(400).end(`Invalid Fluid Url`);
        } else {
            const token = getR11sToken(
                urlParts.tenantId,
                urlParts.documentId,
                appTenants,
                scopes,
                user);
            response.status(200).json(token);
        }
    });

    router.get("/moniker", (request, response) => {
        response
            .header("Cache-Control", "no-cache, no-store, must-revalidate")
            .header("Pragma", "no-cache")
            .header("Expires", "0")
            .status(200)
            .json(moniker.choose());
    });

    return router;
}
