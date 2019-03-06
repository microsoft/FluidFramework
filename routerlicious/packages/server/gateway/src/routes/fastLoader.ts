import { IPragueResolvedUrl } from "@prague/container-definitions";
import { IAlfredTenant, ICache } from "@prague/services-core";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import { parse } from "url";
import * as winston from "winston";
import { getConfig, getToken, IAlfredUser } from "../utils";
import { defaultPartials } from "./partials";

function createLoaderScript(
    loaderUrl: string,
    resolved: IPragueResolvedUrl,
    cache: any,
    workerConfig: string,
    chainCode: string,
    scriptIds: string[],
    npm: string,
    userJwt: string) {
    const scriptCode = `
    <script src="${loaderUrl}"></script>
    <script>
        console.log("Cached page rendered");
        loader.initialize(
            window.location.href,
            ${JSON.stringify(resolved)},
            ${JSON.stringify(cache)},
            ${workerConfig},
            "${chainCode}",
            null,
            ${JSON.stringify(scriptIds)},
            "${npm}",
            "${userJwt}");
    </script>
    `;
    return scriptCode;
}

export function create(
    config: Provider,
    cache: ICache,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any,
    urlResolver: (id: string) => string,
): Router {
    const router: Router = Router();
    const jwtKey = config.get("gateway:key");

    /**
     * Loading of a specific shared text.
     */
    router.get("/:tenantId/*", ensureLoggedIn(), async (request, response) => {
        const jwtToken = jwt.sign(
            {
                user: request.user,
            },
            jwtKey);

        const rawPath =  request.params[0] as string;
        const slash = rawPath.indexOf("/");
        const documentId = rawPath.substring(0, slash !== -1 ? slash : rawPath.length);
        const path = rawPath.substring(slash !== -1 ? slash : rawPath.length);

        const tenantId = request.params.tenantId;
        const chaincode = request.query.chaincode;

        const user: IAlfredUser = (request.user) ? {
            displayName: request.user.name,
            id: request.user.oid,
            name: request.user.name,
        } : undefined;

        const token = getToken(tenantId, documentId, appTenants, user);

        const pragueUrl = "prague://" +
        `${parse(config.get("worker:serverUrl")).host}/` +
        `${encodeURIComponent(tenantId)}/` +
        `${encodeURIComponent(documentId)}` +
        path;

        const resolved: IPragueResolvedUrl = {
            ordererUrl: config.get("worker:serverUrl"),
            storageUrl: config.get("worker:blobStorageUrl"),
            tokens: { jwt: token },
            type: "prague",
            url: pragueUrl,
        };

        const emptyCache = {
            blobs: [],
            commits: [],
            refs: { [documentId]: null },
            trees: [],
        };

        const workerConfig = getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));

        const packageUrl = config.get("worker:npm");
        const pageKey = `${tenantId}-${documentId}`;
        const cachedPageP = cache.get(pageKey);
        cachedPageP.then(
            (page) => {
                if (page) {
                    const loaderUrl = urlResolver(`/public/scripts/dist/loader.js`);
                    winston.info(`Sending page ${pageKey} with ${loaderUrl}`);
                    const scriptCode = createLoaderScript(
                        loaderUrl,
                        resolved,
                        emptyCache,
                        workerConfig,
                        chaincode,
                        [],
                        packageUrl,
                        jwtToken,
                        );
                    // response.send(page.replace(`placeholder_for_prague_script`, scriptCode));
                    const pageWithCode = page.concat(scriptCode);
                    response.send(pageWithCode);
                } else {
                    response.render(
                        "loader",
                        {
                            cache: JSON.stringify(null),
                            chaincode: null,
                            config: workerConfig,
                            jwt: jwtToken,
                            partials: defaultPartials,
                            pkg: null,
                            resolved: JSON.stringify(null),
                            timings: JSON.stringify(null),
                            title: documentId,
                            token,
                        });
                }
            },
            (err) => {
                response.status(400).end(safeStringify(err));
            });
    });
    return router;
}
