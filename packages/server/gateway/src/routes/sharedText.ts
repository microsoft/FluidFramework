/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl, ScopeType } from "@prague/protocol-definitions";
import { IAlfredTenant } from "@prague/services-core";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import * as path from "path";
import { parse } from "url";

import { spoEnsureLoggedIn } from "../gateway-odsp-utils";
import { resolveUrl } from "../gateway-urlresolver";
import { IAlfred } from "../interfaces";
import { getConfig, getParam, getToken } from "../utils";
import { defaultPartials } from "./partials";

const defaultTemplate = "pp.txt";
const defaultSpellChecking = "enabled";

// This one is going to need to have references to all storage options

const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];

export function create(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any,
): Router {
    const router: Router = Router();

    /**
     * Loads count number of latest commits.
     */
    router.get("/:tenantId?/:id/commits", ensureLoggedIn(), (request, response, next) => {
        const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

        const versionsP = alfred.getVersions(tenantId, getParam(request.params, "id"), 30);
        versionsP.then(
            (versions) => {
                response.render(
                    "commits",
                    {
                        documentId: getParam(request.params, "id"),
                        partials: defaultPartials,
                        pathPostfix: "commit",
                        tenantId,
                        type: "sharedText",
                        versions: JSON.stringify(versions),
                    });
            },
            (error) => {
                response.status(400).json(safeStringify(error));
            });
    });

    /**
     * Loads task graph for the document.
     */
    router.get("/:tenantId?/:id/taskGraph", ensureLoggedIn(), (request, response, next) => {
        const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

        const workerConfig = getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));
        const versionP = alfred.getLatestVersion(tenantId, getParam(request.params, "id"));
        const token = getToken(tenantId, getParam(request.params, "id"), appTenants, scopes);

        versionP.then((version) => {
            response.render(
                "taskGraph",
                {
                    config: workerConfig,
                    documentId: getParam(request.params, "id"),
                    partials: defaultPartials,
                    tenantId,
                    title: getParam(request.params, "id"),
                    token,
                    version: JSON.stringify(version),
                });
        }, (error) => {
            response.status(400).json(safeStringify(error));
        });
    });

    /**
     * Loading of a specific version of shared text.
     */
    router.get("/:tenantId?/:id/commit", ensureLoggedIn(), async (request, response, next) => {
        const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

        const disableCache = "disableCache" in request.query;
        const token = getToken(tenantId, getParam(request.params, "id"), appTenants, scopes);

        const workerConfig = getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));
        const targetVersionSha = request.query.version;
        const versionP = alfred.getVersion(
            tenantId,
            getParam(request.params, "id"),
            targetVersionSha);

        versionP.then((version) => {
            const pragueUrl = "prague://" +
                `${parse(config.get("worker:serverUrl")).host}/` +
                `${encodeURIComponent(tenantId)}/` +
                `${encodeURIComponent(getParam(request.params, "id"))}` +
                `?version=${version.sha}`;

            const deltaStorageUrl =
                config.get("worker:serverUrl") +
                "/deltas" +
                `/${encodeURIComponent(tenantId)}/${encodeURIComponent(getParam(request.params, "id"))}`;

            const storageUrl =
                config.get("worker:blobStorageUrl").replace("historian:3000", "localhost:3001") +
                "/repos" +
                `/${encodeURIComponent(tenantId)}`;

            const resolved: IFluidResolvedUrl = {
                endpoints: {
                    deltaStorageUrl,
                    ordererUrl: config.get("worker:serverUrl"),
                    storageUrl,
                },
                tokens: { jwt: token },
                type: "prague",
                url: pragueUrl,
            };

            const options = {
                spellchecker: "disabled",
            };
            response.render(
                "sharedText",
                {
                    cache: JSON.stringify(null),
                    config: workerConfig,
                    disableCache,
                    from: Number.NaN,
                    generateSummaries: false,
                    options: JSON.stringify(options),
                    partials: defaultPartials,
                    resolved: JSON.stringify(resolved),
                    template: undefined,
                    title: getParam(request.params, "id"),
                    to: Number.NaN,
                    version: JSON.stringify(version),
                });
        }, (error) => {
            response.status(400).json(safeStringify(error));
        });
    });

    router.post("/:tenantId?/:id/fork", ensureLoggedIn(), (request, response, next) => {
        const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

        const forkP = alfred.createFork(tenantId, getParam(request.params, "id"));
        forkP.then(
            (fork) => {
                response.redirect(`/sharedText/${fork}`);
            },
            (error) => {
                response.status(400).json(safeStringify(error));
            });
    });

    /**
     * Loading of a specific shared text.
     */
    router.get("/:tenantId?/:id", spoEnsureLoggedIn(), ensureLoggedIn(), (request, response, next) => {
        const start = Date.now();

        const disableCache = "disableCache" in request.query;
        const generateSummaries = "generateSummaries" in request.query;

        const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

        const from = +request.query.from;
        const to = +request.query.to;

        const jwtToken = jwt.sign(
            {
                user: request.user,
            },
            config.get("gateway:key"));

        const workerConfig = getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));

        const [resolvedP, fullTreeP] =
            resolveUrl(config, alfred, appTenants, tenantId, getParam(request.params, "id"), scopes, request);
        const treeTimeP = fullTreeP.then(() => Date.now() - start);

        Promise.all([resolvedP, fullTreeP, treeTimeP]).then(([resolved, fullTree, treeTime]) => {
            const parsedTemplate = path.parse(request.query.template ? request.query.template : defaultTemplate);
            const template =
                parsedTemplate.base !== "empty" ? `/public/literature/${parsedTemplate.base}` : undefined;
            const parsedSpellchecking =
                path.parse(request.query.spellchecking ? request.query.spellchecking : defaultSpellChecking);
            const spellchecker = parsedSpellchecking.base === "disabled" ? `disabled` : defaultSpellChecking;
            const options = {
                spellchecker,
                translationFromLanguage: "languageFrom" in request.query ? request.query.languageFrom : undefined,
                translationToLanguage: "languageTo" in request.query ? request.query.languageTo : undefined,
            };

            const timings = [treeTime, Date.now() - start];
            response.render(
                "sharedText",
                {
                    cache: fullTree ? JSON.stringify(fullTree.cache) : undefined,
                    config: workerConfig,
                    disableCache,
                    from,
                    generateSummaries,
                    jwt: jwtToken,
                    options: JSON.stringify(options),
                    partials: defaultPartials,
                    resolved: JSON.stringify(resolved),
                    template,
                    timings: JSON.stringify(timings),
                    title: getParam(request.params, "id"),
                    to,
                });
        }, (error) => {
            response.status(400).json(safeStringify(error));
        }).catch((error) => {
            response.status(500).json(error);
        });
    });

    return router;
}
