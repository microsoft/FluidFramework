import { IPraguePackage, IPragueResolvedUrl } from "@prague/container-definitions";
import { IAlfredTenant, ICache, IDocumentStorage, ITenantManager } from "@prague/services-core";
import Axios from "axios";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import { parse } from "url";
import * as winston from "winston";
import { getConfig, getToken, IAlfredUser } from "../utils";
import { defaultPartials } from "./partials";

interface ICachedPackage {
    entrypoint: string;
    scripts: Array<{ id: string, url: string }>;
}

const scriptCache = new Map<string, Promise<ICachedPackage>>();

function getScriptsForCode(externalUrl: string, internalUrl: string, pkg: string): Promise<ICachedPackage> {
    if (!pkg) {
        return null;
    }

    const components = pkg.match(/(.*)\/(.*)@(.*)/);
    if (!components) {
        return Promise.reject("Invalid package");
    }

    winston.info(pkg);
    if (!scriptCache.has(pkg)) {
        const [, scope, name, version] = components;
        const packageUrl = `${internalUrl}/${encodeURI(scope)}/${encodeURI(`${name}@${version}`)}`;
        const url = `${packageUrl}/package.json`;
        const packageP = Axios.get<IPraguePackage>(url).then((result) => {
            return {
                entrypoint: result.data.prague.browser.entrypoint,
                scripts: result.data.prague.browser.bundle.map(
                    (script, index) => {
                        return {
                            id: `${name}-${index}`,
                            url: `${packageUrl}/${script}`.replace(internalUrl, externalUrl),
                        };
                    }),
            };
        });
        scriptCache.set(pkg, packageP);
    }

    return scriptCache.get(pkg);
}

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    storage: IDocumentStorage,
    cache: ICache,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any): Router {

    const router: Router = Router();
    const jwtKey = config.get("alfred:key");

    /**
     * Loading of a specific shared text.
     */
    router.get("/:tenantId/*", ensureLoggedIn(), async (request, response, next) => {
        const start = Date.now();

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

        const workerConfigP = getConfig(
            config.get("worker"),
            tenantManager,
            tenantId,
            config.get("error:track"),
            config.get("client"));

        const packageUrl = config.get("worker:npm");
        const cachedPageP = cache.get(`${tenantId}-${documentId}`);
        Promise.all([workerConfigP, cachedPageP]).then(([workerConfig, page]) => {
            if (page) {
                winston.info(`Sending cached page`);
                const scriptCode = createLoaderScript(
                    resolved,
                    emptyCache,
                    workerConfig,
                    chaincode,
                    [],
                    packageUrl,
                    jwtToken);
                // response.send(page.replace(`placeholder_for_prague_script`, scriptCode));
                const pageWithCode = page.concat(scriptCode);
                response.send(pageWithCode);
            } else {
                const key = appTenants
                .find((tenant: IAlfredTenant) => tenant.id === tenantId)
                .key;

                const fullTreeP = storage.getFullTree(tenantId, documentId);
                const pkgP = fullTreeP.then((fullTree) => {
                    winston.info(`getScriptsForCode ${tenantId}/${documentId} +${Date.now() - start}`);
                    return getScriptsForCode(
                        config.get("worker:npm"),
                        config.get("worker:clusterNpm"),
                        fullTree.code ? fullTree.code : chaincode);
                });

                // Track timing
                const workerTimeP = workerConfigP.then(() => Date.now() - start);
                const treeTimeP = fullTreeP.then(() => Date.now() - start);
                const pkgTimeP = pkgP.then(() => Date.now() - start);
                const timingsP = Promise.all([workerTimeP, treeTimeP, pkgTimeP]);

                // tslint:disable-next-line
                Promise.all([workerConfigP, fullTreeP, pkgP, timingsP]).then(([workerConfig, fullTree, pkg, timings]) => {
                    winston.info(`render ${tenantId}/${documentId} +${Date.now() - start}`);

                    timings.push(Date.now() - start);
                    response.render(
                        "loader",
                        {
                            cache: JSON.stringify(fullTree.cache),
                            chaincode: fullTree.code ? fullTree.code : chaincode,
                            config: workerConfig,
                            jwt: jwtToken,
                            key,
                            partials: defaultPartials,
                            pkg,
                            resolved: JSON.stringify(resolved),
                            timings: JSON.stringify(timings),
                            title: documentId,
                            token,
                        });
                    }, (error) => {
                        response.status(400).end(safeStringify(error));
                });
            }
        }, (err) => {
            response.status(400).end(safeStringify(err));
        });
    });
    return router;
}

function createLoaderScript(
    resolved: IPragueResolvedUrl,
    cache: any,
    workerConfig: string,
    chainCode: string,
    scriptIds: string[],
    npm: string,
    userJwt: string) {
    const scriptCode = `
    <script src="/public/scripts/dist/loader.js"></script>
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
