/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@prague/container-definitions";
import { extractDetails, WebLoader } from "@prague/loader-web";
import { ScopeType } from "@prague/protocol-definitions";
import { promiseTimeout } from "@prague/services-client";
import { IAlfredTenant } from "@prague/services-core";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
import { Provider } from "nconf";
import { parse } from "url";
import { v4 } from "uuid";
import * as winston from "winston";
import { spoEnsureLoggedIn } from "../gateway-odsp-utils";
import { resolveUrl } from "../gateway-urlresolver";
import { IAlfred } from "../interfaces";
import { KeyValueLoader } from "../keyValueLoader";
import { getConfig, getParam } from "../utils";
import { defaultPartials } from "./partials";

const cacheLoadTimeoutMS = 10000;

export function create(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any): Router {

    const router: Router = Router();
    const jwtKey = config.get("gateway:key");
    const webLoader = new WebLoader(config.get(config.get("worker:npm")));

    const keyValueLoaderP = promiseTimeout(cacheLoadTimeoutMS, KeyValueLoader.load(config));
    const cacheP = keyValueLoaderP.then((keyValueLoader: KeyValueLoader) => {
        return keyValueLoader.cache;
    }, (err) => {
        return Promise.reject(err);
    });
    cacheP.then((cache) => {
        winston.info(cache.get(""));
    }, (err) => {
        winston.info(err);
    });

    /**
     * Loading of a specific fluid document.
     */
    router.get("/:tenantId/*", spoEnsureLoggedIn(), ensureLoggedIn(), (request, response) => {
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

        const tenantId = getParam(request.params, "tenantId");

        const search = parse(request.url).search;
        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const [resolvedP, fullTreeP] =
            resolveUrl(config, alfred, appTenants, tenantId, documentId, scopes, request);

        const workerConfig = getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));

        const pkgP = fullTreeP.then((fullTree) => {
            if (fullTree && fullTree.code) {
                return webLoader.resolve(fullTree.code);
            }

            if (!request.query.chaincode) {
                return;
            }

            const chaincode: string = request.query.chaincode ? request.query.chaincode : "";
            const cdn = request.query.cdn ? request.query.cdn : config.get("worker:npm");
            const entryPoint = request.query.entrypoint;

            let codeDetails: IFluidCodeDetails;
            if (chaincode.indexOf("http") === 0) {
                codeDetails = {
                    config: {
                        [`@gateway:cdn`]: chaincode,
                    },
                    package: {
                        fluid: {
                            browser: {
                                umd: {
                                    files: [chaincode],
                                    library: entryPoint,
                                },
                            },
                        },
                        name: `@gateway/${v4()}`,
                        version: "0.0.0",
                    },
                };
            } else {
                const details = extractDetails(chaincode);
                codeDetails = {
                    config: {
                        [`@${details.scope}:cdn`]: cdn,
                    },
                    package: chaincode,
                };
            }

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
            resolved.url += path + (search ? search : "");
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
