import { IAlfredTenant } from "@prague/services-core";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
import { Provider } from "nconf";
import { parse } from "url";
import * as winston from "winston";
import { spoEnsureLoggedIn } from "../gateway-odsp-utils";
import { gatewayResolveUrl } from "../gateway-urlresolver";
import { IAlfred } from "../interfaces";
import { KeyValueManager } from "../keyValueManager";
import { getConfig, getScriptsForCode } from "../utils";
import { defaultPartials } from "./partials";

export function create(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    keyValueManager: KeyValueManager,
    ensureLoggedIn: any): Router {

    const router: Router = Router();
    const jwtKey = config.get("gateway:key");

    /**
     * Loading of a specific fluid document.
     */
    router.get("/:tenantId/*", spoEnsureLoggedIn(), ensureLoggedIn(), (request, response, next) => {
        const start = Date.now();

        const jwtToken = jwt.sign(
            {
                user: request.user,
            },
            jwtKey);

        const rawPath = request.params[0] as string;
        const slash = rawPath.indexOf("/");
        const documentId = rawPath.substring(0, slash !== -1 ? slash : rawPath.length);
        const path = rawPath.substring(slash !== -1 ? slash : rawPath.length);

        const tenantId = request.params.tenantId;

        // SPO will always depends on the passed in chaincode since we don't get the fullTree on the server.
        const codePackage: string = request.query.chaincode ? request.query.chaincode : "";
        const spoSuffix = codePackage.replace(/[^A-Za-z0-9-]/g, "_");
        const search = parse(request.url).search;
        const [resolvedP, fullTreeP] =
            gatewayResolveUrl(config, alfred, appTenants, tenantId, documentId, spoSuffix, request);

        // Return the original string if the key was not found.
        const chaincodeP = keyValueManager.get(codePackage).then((value) => {
            winston.info(`Key: ${codePackage}, Value: ${value}`);
            return value === undefined ? codePackage : `${codePackage}@${value}`;
        }, () => {
            winston.info(`${codePackage} not found in key-value store`);
            return codePackage;
        });

        const workerConfig = getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));

        const pkgP = Promise.all([fullTreeP, chaincodeP]).then(([fullTree, chaincode]) => {
            winston.info(`Chaincode ${chaincode}`);
            winston.info(`getScriptsForCode ${tenantId}/${documentId} +${Date.now() - start}`);
            return getScriptsForCode(
                config.get("worker:npm"),
                config.get("worker:clusterNpm"),
                fullTree && fullTree.code ? fullTree.code : chaincode);
        });

        // Track timing
        const treeTimeP = fullTreeP.then(() => Date.now() - start);
        const pkgTimeP = pkgP.then(() => Date.now() - start);
        const timingsP = Promise.all([treeTimeP, pkgTimeP]);

        Promise.all([resolvedP, fullTreeP, pkgP, timingsP, chaincodeP])
            .then(([resolved, fullTree, pkg, timings, chaincode]) => {
            resolved.url += path + (search ? search : "");
            winston.info(`render ${tenantId}/${documentId} +${Date.now() - start}`);

            timings.push(Date.now() - start);

            response.render(
                "loader",
                {
                    cache: fullTree ? JSON.stringify(fullTree.cache) : undefined,
                    chaincode: fullTree && fullTree.code ? fullTree.code : chaincode,
                    config: workerConfig,
                    jwt: jwtToken,
                    partials: defaultPartials,
                    pkg,
                    resolved: JSON.stringify(resolved),
                    timings: JSON.stringify(timings),
                    title: documentId,
                });
        }, (error) => {
            response.status(400).end(safeStringify(error, undefined, 2));
        }).catch((error) => {
            response.status(500).end(safeStringify(error, undefined, 2));
        });
    });

    return router;
}
