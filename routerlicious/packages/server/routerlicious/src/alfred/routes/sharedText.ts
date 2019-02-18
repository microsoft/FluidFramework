import { IAlfredTenant, IDocumentStorage, ITenantManager } from "@prague/services-core";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import { Provider } from "nconf";
import * as path from "path";
import { getConfig, getToken } from "../utils";
import { defaultPartials } from "./partials";

const defaultTemplate = "pp.txt";
const defaultSpellChecking = "enabled";

// This one is going to need to have references to all storage options

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    storage: IDocumentStorage,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any): Router {

    const router: Router = Router();

    /**
     * Loads count number of latest commits.
     */
    router.get("/:tenantId?/:id/commits", ensureLoggedIn(), (request, response, next) => {
        const tenantId = request.params.tenantId || appTenants[0].id;

        const versionsP = storage.getVersions(tenantId, request.params.id, 30);
        versionsP.then(
            (versions) => {
                response.render(
                    "commits",
                    {
                        documentId: request.params.id,
                        partials: defaultPartials,
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
        const tenantId = request.params.tenantId || appTenants[0].id;

        const workerConfigP = getConfig(
            config.get("worker"),
            tenantManager,
            tenantId,
            config.get("error:track"),
            config.get("client"));
        const versionP = storage.getLatestVersion(tenantId, request.params.id);
        const token = getToken(tenantId, request.params.id, appTenants);

        Promise.all([workerConfigP, versionP]).then((values) => {
            response.render(
                "taskGraph",
                {
                    config: values[0],
                    documentId: request.params.id,
                    partials: defaultPartials,
                    tenantId,
                    title: request.params.id,
                    token,
                    version: JSON.stringify(values[1]),
                });
        }, (error) => {
            response.status(400).json(safeStringify(error));
        });
    });

    /**
     * Loading of a specific version of shared text.
     */
    router.get("/:tenantId?/:id/commit", ensureLoggedIn(), async (request, response, next) => {
        const tenantId = request.params.tenantId || appTenants[0].id;

        const disableCache = "disableCache" in request.query;
        const token = getToken(tenantId, request.params.id, appTenants);

        const workerConfigP = getConfig(
            config.get("worker"),
            tenantManager,
            tenantId,
            config.get("error:track"),
            config.get("client"));
        const targetVersionSha = request.query.version;
        const versionP = storage.getVersion(
            tenantId,
            request.params.id,
            targetVersionSha);

        Promise.all([workerConfigP, versionP]).then((values) => {
            const options = {
                spellchecker: "disabled",
            };
            response.render(
                "sharedText",
                {
                    config: values[0],
                    connect: false,
                    disableCache,
                    documentId: request.params.id,
                    from: Number.NaN,
                    options: JSON.stringify(options),
                    pageInk: request.query.pageInk === "true",
                    partials: defaultPartials,
                    template: undefined,
                    tenantId,
                    title: request.params.id,
                    to: Number.NaN,
                    token,
                    version: JSON.stringify(values[1]),
                });
        }, (error) => {
            response.status(400).json(safeStringify(error));
        });
    });

    router.post("/:tenantId?/:id/fork", ensureLoggedIn(), (request, response, next) => {
        const tenantId = request.params.tenantId || appTenants[0].id;

        const forkP = storage.createFork(tenantId, request.params.id);
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
    router.get("/:tenantId?/:id", ensureLoggedIn(), async (request, response, next) => {
        const disableCache = "disableCache" in request.query;
        const direct = "direct" in request.query;

        const tenantId = request.params.tenantId || appTenants[0].id;
        const token = getToken(tenantId, request.params.id, appTenants);

        const from = +request.query.from;
        const to = +request.query.to;

        // Temporary until we allow tokens that can access multiple documents
        const tenant = appTenants.find((appTenant) => appTenant.id === tenantId);

        const workerConfigP = getConfig(
            config.get("worker"),
            tenantManager,
            tenantId,
            config.get("error:track"),
            config.get("client"),
            direct);

        const versionP = storage.getLatestVersion(tenantId, request.params.id);
        const fullTreeP = versionP.then((version) => storage.getFullTree(tenantId, request.params.id, version));
        // const header = storage.getHeader(); // header?

        Promise.all([workerConfigP, versionP, fullTreeP]).then(([workerConfig, version, fullTree]) => {
            const parsedTemplate = path.parse(request.query.template ? request.query.template : defaultTemplate);
            const template =
                parsedTemplate.base !== "empty" ? `/public/literature/${parsedTemplate.base}` : undefined;

            const parsedSpellchecking =
                path.parse(request.query.spellchecking ? request.query.spellchecking : defaultSpellChecking);
            const spellchecker = parsedSpellchecking.base === "disabled" ? `disabled` : defaultSpellChecking;
            const options = {
                spellchecker,
                translationLanguage: "language" in request.query ? request.query.language : undefined,
            };

            response.render(
                "sharedText",
                {
                    config: workerConfig,
                    connect: true,
                    disableCache,
                    documentId: request.params.id,
                    from,
                    fullTree: JSON.stringify(fullTree),
                    key: tenant.key,
                    options: JSON.stringify(options),
                    pageInk: request.query.pageInk === "true",
                    partials: defaultPartials,
                    template,
                    tenantId,
                    title: request.params.id,
                    to,
                    token,
                    version: JSON.stringify(version),
                });
            }, (error) => {
                response.status(400).json(safeStringify(error));
        });
    });

    return router;
}
