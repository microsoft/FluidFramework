/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails, IPraguePackage } from "@prague/container-definitions";
import { extractDetails, WebLoader } from "@prague/loader-web";
import { IAlfredTenant } from "@prague/services-core";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
import { Provider } from "nconf";
import * as winston from "winston";
import { spoEnsureLoggedIn } from "../gateway-odsp-utils";
import { resolveUrl } from "../gateway-urlresolver";
import { IAlfred } from "../interfaces";
import { getConfig } from "../utils";
import { defaultPartials } from "./partials";
// tslint:disable-next-line: no-var-requires no-require-imports
const pkgJson = require("../../package.json") as IPraguePackage;

export function create(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any): Router {

    const router: Router = Router();
    const jwtKey = config.get("gateway:key");
    const webLoader = new WebLoader(config.get(config.get("worker:npm")));

    /**
     * Loading of a specific fluid document.
     */
    router.get("/:id", spoEnsureLoggedIn(), ensureLoggedIn(), (request, response, next) => {
        const start = Date.now();

        const jwtToken = jwt.sign(
            {
                user: request.user,
            },
            jwtKey);

        const documentId = request.params.id;
        const tenantId = appTenants[0].id;
        const [resolvedP, fullTreeP] =
            resolveUrl(config, alfred, appTenants, tenantId, documentId, request);

        const workerConfig = getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));

        const pkgP = fullTreeP.then((fullTree) => {
            if (fullTree && fullTree.code) {
                return webLoader.resolve(fullTree.code);
            }

            const chaincode: string = `@chaincode/externalcomponentloader@^${pkgJson.version}`;
            const cdn = request.query.cdn ? request.query.cdn : config.get("worker:npm");

            let codeDetails: IFluidCodeDetails;
            const details = extractDetails(chaincode);
            codeDetails = {
                config: {
                    [`@${details.scope}:cdn`]: cdn,
                },
                package: chaincode,
            };

            return webLoader.resolve(codeDetails);
        });

        const scriptsP = pkgP.then((pkg) => {
            if (!pkg) {
                return [];
            }

            const umd = pkg.pkg.fluid && pkg.pkg.fluid.browser && pkg.pkg.fluid.browser.umd;
            if (!umd) {
                return [];
            }

            return {
                entrypoint: umd.library,
                scripts: umd.files.map(
                    (script, index) => {
                        return {
                            id: `${pkg.parsed.name}-${index}`,
                            url: script.indexOf("http") === 0 ? script : `${pkg.packageUrl}/${script}`,
                        };
                    }),
            };
        });

        // Track timing
        const treeTimeP = fullTreeP.then(() => Date.now() - start);
        const pkgTimeP = pkgP.then(() => Date.now() - start);
        const timingsP = Promise.all([treeTimeP, pkgTimeP]);

        Promise.all([resolvedP, fullTreeP, pkgP, scriptsP, timingsP])
            .then(([resolved, fullTree, pkg, scripts, timings]) => {
            resolved.url += `?chaincode=@chaincode/externalcomponentloader@^${pkgJson.version}`;
            winston.info(`render ${tenantId}/${documentId} +${Date.now() - start}`);

            timings.push(Date.now() - start);

            response.render(
                "loader",
                {
                    cache: fullTree ? JSON.stringify(fullTree.cache) : undefined,
                    chaincode: JSON.stringify(pkg),
                    config: workerConfig,
                    jwt: jwtToken,
                    npm: config.get("worker:npm"),
                    partials: defaultPartials,
                    resolved: JSON.stringify(resolved),
                    scripts,
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
