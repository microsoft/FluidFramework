/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse, UrlWithStringQuery } from "url";
import { IResolvedUrl, IWebResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { ScopeType } from "@microsoft/fluid-protocol-definitions";
import { getR11sToken, IAlfredUser } from "@microsoft/fluid-routerlicious-urlresolver";
import { IAlfredTenant } from "@microsoft/fluid-server-services-client";
import Axios from "axios";
import { Request, Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as moniker from "moniker";
import { Provider } from "nconf";
import * as passport from "passport";
import * as winston from "winston";
import { IJWTClaims } from "../../utils";

// Although probably the case we want a default behavior here. Maybe just the URL?
async function getWebComponent(url: UrlWithStringQuery): Promise<IWebResolvedUrl> {
    const result = await Axios.get(url.href);

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
    const regex = url.protocol === "fluid:"
        ? /^\/([^/]*)\/([^/]*)(\/?.*)$/
        : /^\/loader\/([^/]*)\/([^/]*)(\/?.*)$/;
    // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
    const match = url.path.match(regex);

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!match) {
        return getWebComponent(url);
    }

    const tenantId = match[1];
    const documentId = match[2];
    const path = match[3];

    const orderer = config.get("worker:serverUrl");

    const user: IAlfredUser = (request.user as IJWTClaims).user;

    const token = getR11sToken(tenantId, documentId, appTenants, scopes, user);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    const fluidUrl = `fluid://${url.host}/${tenantId}/${documentId}${path}${url.hash ? url.hash : ""}`;

    const deltaStorageUrl =
        `${config.get("worker:serverUrl")}\
        /deltas\
        /${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}`;

    const storageUrl =
        `${config.get("worker:blobStorageUrl").replace("historian:3000", "localhost:3001")}\
        /repos\
        /${encodeURIComponent(tenantId)}`;

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

        const resultP = (alfred.host === url.host || gateway.host === url.host)
            ? getInternalComponent(request, config, url, appTenants, scopes)
            : isExternalComponent(urlPrefix, federatedEndpoints)
                ? getExternalComponent(request, `${urlPrefix}/api/v1/load`, request.body.url as string, scopes)
                : getWebComponent(url);

        resultP.then(
            (result) => response.status(200).json(result),
            (error) => response.status(400).end(safeStringify(error)));
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
