import { IPragueResolvedUrl } from "@prague/container-definitions";
import { IAlfredTenant } from "@prague/services-core";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
import { Provider } from "nconf";
import { parse } from "url";
import * as winston from "winston";
import { IAlfred } from "../interfaces";
import { getConfig, getScriptsForCode, getToken, IAlfredUser } from "../utils";
import { defaultPartials } from "./partials";

export function create(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any): Router {

    const router: Router = Router();
    const jwtKey = config.get("gateway:key");

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

        const workerConfig = getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));

        const fullTreeP = alfred.getFullTree(tenantId, documentId);
        const pkgP = fullTreeP.then((fullTree) => {
            winston.info(`getScriptsForCode ${tenantId}/${documentId} +${Date.now() - start}`);
            return getScriptsForCode(
                config.get("worker:npm"),
                config.get("worker:clusterNpm"),
                fullTree.code ? fullTree.code : chaincode);
        });

        // Track timing
        const treeTimeP = fullTreeP.then(() => Date.now() - start);
        const pkgTimeP = pkgP.then(() => Date.now() - start);
        const timingsP = Promise.all([treeTimeP, pkgTimeP]);
        const search = parse(request.url).search;

        const pragueUrl = "prague://" +
            `${parse(config.get("worker:serverUrl")).host}/` +
            `${encodeURIComponent(tenantId)}/` +
            `${encodeURIComponent(documentId)}` +
            path +
            (search ? search : "");

        const resolved: IPragueResolvedUrl = {
            endpoints: {
                ordererUrl: config.get("worker:serverUrl"),
                storageUrl: config.get("worker:blobStorageUrl").replace("historian:3000", "localhost:3001"),
            },
            tokens: { jwt: token },
            type: "prague",
            url: pragueUrl,
        };

        Promise.all([fullTreeP, pkgP, timingsP]).then(([fullTree, pkg, timings]) => {
            winston.info(`render ${tenantId}/${documentId} +${Date.now() - start}`);

            timings.push(Date.now() - start);

            response.render(
                "loader",
                {
                    cache: JSON.stringify(fullTree.cache),
                    chaincode: fullTree.code ? fullTree.code : chaincode,
                    config: workerConfig,
                    jwt: jwtToken,
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
    });

    return router;
}
