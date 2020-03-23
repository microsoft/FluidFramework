/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPackage } from "@microsoft/fluid-container-definitions";
import { ScopeType } from "@microsoft/fluid-protocol-definitions";
import { IAlfredTenant } from "@microsoft/fluid-server-services-client";
import { extractDetails, WebCodeLoader, WhiteList } from "@microsoft/fluid-web-code-loader";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";
import { Provider } from "nconf";
import * as winston from "winston";
import { spoEnsureLoggedIn } from "../gatewayOdspUtils";
import { resolveUrl } from "../gatewayUrlResolver";
import { IAlfred } from "../interfaces";
import { getConfig, getUserDetails } from "../utils";
import { defaultPartials } from "./partials";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkgJson = require("../../package.json") as IPackage;
const defaultChaincode =
    `@microsoft/fluid-external-component-loader@${pkgJson.version.endsWith(".0") ? "^" : ""}${pkgJson.version}`;

export function create(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any): Router {

    const router: Router = Router();
    const jwtKey = config.get("gateway:key");
    const webLoader = new WebCodeLoader(new WhiteList());

    router.get("/", spoEnsureLoggedIn(), ensureLoggedIn(), (request, response, next) => {
        let redirect = `${request.baseUrl}/${moniker.choose()}`;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (request.query.chaincode) {
            redirect += `?chaincode=${request.query.chaincode}`;
        }
        return response.status(302).redirect(redirect);
    });

    router.get("/:id*", spoEnsureLoggedIn(), ensureLoggedIn(), (request, response, next) => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const chaincode = request.query.chaincode ? request.query.chaincode : defaultChaincode;
        const start = Date.now();

        const jwtToken = jwt.sign(
            {
                user: request.user,
            },
            jwtKey);

        const documentId = request.params.id;
        const path = request.params[0];
        const tenantId = appTenants[0].id;
        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const [resolvedP, fullTreeP] =
            resolveUrl(config, alfred, appTenants, tenantId, documentId, scopes, request);

        const workerConfig = getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));

        const pkgP = fullTreeP.then((fullTree) => {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (path) {
                return;
            }

            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (fullTree && fullTree.code) {
                return webLoader.resolve(fullTree.code);
            }

            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            const cdn = request.query.cdn ? request.query.cdn : config.get("worker:npm");

            const details = extractDetails(chaincode);
            const codeDetails = {
                config: {
                    [`@${details.scope}:cdn`]: cdn,
                },
                package: chaincode,
            };

            return webLoader.resolve(codeDetails);
        });

        const scriptsP = pkgP.then((pkg) => {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!pkg) {
                return [];
            }

            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            const umd = pkg.pkg.fluid && pkg.pkg.fluid.browser && pkg.pkg.fluid.browser.umd;
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!umd) {
                return [];
            }

            return {
                entrypoint: umd.library,
                scripts: umd.files.map(
                    (script, index) => {
                        return {
                            id: `${pkg.parsed.name}-${index}`,
                            url: script.startsWith("http") ? script : `${pkg.packageUrl}/${script}`,
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
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (!pkg) {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    resolved!.url += `${path}`;
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    resolved!.url += `?chaincode=${chaincode}`;
                }
                winston.info(`render ${tenantId}/${documentId} +${Date.now() - start}`);

                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                timings!.push(Date.now() - start);

                response.render(
                    "loader",
                    {
                        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
                        user: getUserDetails(request),
                    });
            }, (error) => {
                response.status(400).end(safeStringify(error, undefined, 2));
            }).catch((error) => {
                response.status(500).end(safeStringify(error, undefined, 2));
            });
    });

    return router;
}
