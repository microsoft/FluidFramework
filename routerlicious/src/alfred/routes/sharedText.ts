import { Router } from "express";
import { Provider } from "nconf";
import * as path from "path";
import { ITenantManager } from "../../api-core";
import * as utils from "../../utils";
import * as storage from "../storage";
import { IAlfredTenant } from "../tenant";
import { getConfig, getToken } from "../utils";
import { defaultPartials } from "./partials";

const defaultTemplate = "pp.txt";
const defaultSpellChecking = "enabled";

// This one is going to need to have references to all storage options

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    mongoManager: utils.MongoManager,
    producer: utils.IProducer,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any): Router {

    const router: Router = Router();
    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    /**
     * Loads count number of latest commits.
     */
    router.get("/:tenantId?/:id/commits", ensureLoggedIn(), (request, response, next) => {
        const tenantId = request.params.tenantId || appTenants[0].id;

        const versionsP = storage.getVersions(tenantManager, tenantId, request.params.id, 30);
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
                response.status(400).json(error);
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
            tenantManager,
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
                    options: JSON.stringify(options),
                    pageInk: request.query.pageInk === "true",
                    partials: defaultPartials,
                    template: undefined,
                    tenantId,
                    title: request.params.id,
                    token,
                    version: JSON.stringify(values[1]),
                });
        }, (error) => {
            response.status(400).json(error);
        });
    });

    router.post("/:tenantId?/:id/fork", ensureLoggedIn(), (request, response, next) => {
        const tenantId = request.params.tenantId || appTenants[0].id;

        const forkP = storage.createFork(
            producer,
            tenantManager,
            mongoManager,
            documentsCollectionName,
            tenantId,
            request.params.id);
        forkP.then(
            (fork) => {
                response.redirect(`/sharedText/${fork}`);
            },
            (error) => {
                response.status(400).json(error);
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

        const workerConfigP = getConfig(
            config.get("worker"),
            tenantManager,
            tenantId,
            config.get("error:track"),
            config.get("client"),
            direct);
        const versionP = storage.getLatestVersion(tenantManager, tenantId, request.params.id);
        Promise.all([workerConfigP, versionP]).then((values) => {
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
                    config: values[0],
                    connect: true,
                    disableCache,
                    documentId: request.params.id,
                    options: JSON.stringify(options),
                    pageInk: request.query.pageInk === "true",
                    partials: defaultPartials,
                    template,
                    tenantId,
                    title: request.params.id,
                    token,
                    version: JSON.stringify(values[1]),
                });
            }, (error) => {
                response.status(400).json(error);
        });
    });

    return router;
}
