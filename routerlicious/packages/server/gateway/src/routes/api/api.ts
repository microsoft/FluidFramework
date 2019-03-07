import { IResolvedUrl, IWebResolvedUrl } from "@prague/container-definitions";
import * as core from "@prague/services-core";
import Axios from "axios";
import { Request, Router } from "express";
import * as safeStringify from "json-stringify-safe";
import { Provider } from "nconf";
import passport = require("passport");
import { parse, UrlWithStringQuery } from "url";
import { getToken, IAlfredUser } from "../../utils";

// Although probably the case we want a default behavior here. Maybe just the URL?
async function getExternalComponent(url: UrlWithStringQuery): Promise<IWebResolvedUrl> {
    const result = await Axios.get(url.href);

    return {
        data: result.data,
        type: "web",
    };
}

async function getInternalComponent(
    request: Request,
    config: Provider,
    url: UrlWithStringQuery,
    appTenants: core.IAlfredTenant[],
): Promise<IResolvedUrl> {
    const regex = url.protocol === "prague:"
        ? /^\/([^\/]*)\/([^\/]*)(\/?.*)$/
        : /^\/loader\/([^\/]*)\/([^\/]*)(\/?.*)$/;
    const match = url.path.match(regex);

    if (!match) {
        return getExternalComponent(url);
    }

    const tenantId = match[1];
    const documentId = match[2];
    const path = match[3];

    const orderer = config.get("worker:serverUrl");
    const storage = config.get("worker:blobStorageUrl");

    const user: IAlfredUser = (request.user) ? {
        displayName: request.user.name,
        id: request.user.oid,
        name: request.user.name,
    } : undefined;
    const token = getToken(tenantId, documentId, appTenants, user);

    return {
        ordererUrl: orderer,
        storageUrl: storage,
        tokens: { jwt: token },
        type: "prague",
        url: `prague://${url.host}/${tenantId}/${documentId}${path}${url.hash ? url.hash : ""}`,
    };
}

export function create(
    config: Provider,
    appTenants: core.IAlfredTenant[],
): Router {
    const router: Router = Router();

    const gateway = parse(config.get("gateway:url"));
    const alfred = parse(config.get("worker:serverUrl"));

    router.post("/load", passport.authenticate("jwt", { session: false }), (request, response) => {
        const url = parse(request.body.url);

        const resultP = alfred.host === url.host || gateway.host === url.host
            ? getInternalComponent(request, config, url, appTenants)
            : getExternalComponent(url);

        resultP.then(
            (result) => response.status(200).json(result),
            (error) => response.status(400).end(safeStringify(error)));
    });

    return router;
}
