import { Router } from "express";
import { Provider } from "nconf";
import * as path from "path";
import { ITenantManager } from "../../api-core";
import * as utils from "../../utils";
import * as storage from "../storage";
import { getConfig, getFullId } from "../utils";
import { defaultPartials } from "./partials";

const defaultTemplate = "pp.txt";
const defaultSpellChecking = "enabled";

// This one is going to need to have references to all storage options

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    mongoManager: utils.MongoManager,
    producer: utils.kafkaProducer.IProducer): Router {

    const router: Router = Router();
    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    /**
     * Loads count number of latest commits.
     */
    router.get("/:tenantId?/:id/commits", (request, response, next) => {
        const id = getFullId(request.params.tenantId, request.params.id);

        const versionsP = storage.getVersions(tenantManager, request.params.tenantId, request.params.id, 30);
        versionsP.then(
            (versions) => {
                response.render(
                    "commits",
                    {
                        id,
                        partials: defaultPartials,
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
    router.get("/:tenantId?/:id/commit", (request, response, next) => {
        const id = getFullId(request.params.tenantId, request.params.id);

        const workerConfig = getConfig(config.get("worker"), tenantManager, request.params.tenantId);
        const targetVersionSha = request.query.version;
        const versionP = storage.getVersion(
            tenantManager,
            request.params.tenantId,
            request.params.id,
            targetVersionSha);

        versionP.then(
            (version) => {
                const options = {
                    spellchecker: "disabled",
                };
                response.render(
                    "sharedText",
                    {
                        config: workerConfig,
                        id,
                        loadPartial: true,
                        options: JSON.stringify(options),
                        pageInk: request.query.pageInk === "true",
                        partials: defaultPartials,
                        template: undefined,
                        title: request.params.id,
                        version: JSON.stringify(version),
                    });
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    router.post("/:tenantId?/:id/fork", (request, response, next) => {
        const forkP = storage.createFork(
            producer,
            tenantManager,
            mongoManager,
            documentsCollectionName,
            request.params.tenantId,
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
    router.get("/:tenantId?/:id", (request, response, next) => {
        const id = getFullId(request.params.tenantId, request.params.id);

        const workerConfig = getConfig(config.get("worker"), tenantManager, request.params.tenantId);
        const versionP = storage.getLatestVersion(tenantManager, request.params.tenantId, request.params.id);
        versionP.then(
            (version) => {
                const parsedTemplate = path.parse(request.query.template ? request.query.template : defaultTemplate);
                const template =
                    parsedTemplate.base !== "empty" ? `/public/literature/${parsedTemplate.base}` : undefined;

                const parsedSpellchecking =
                    path.parse(request.query.spellchecking ? request.query.spellchecking : defaultSpellChecking);
                const spellchecker = parsedSpellchecking.base === "disabled" ? `disabled` : defaultSpellChecking;
                const options = {
                    spellchecker,
                };

                // I need a way to specify the storage location from the URL here. Using the tenant to look it up
                // would be useful. Otherwise I need a way to create a document, store some metadata, and then use
                // that

                response.render(
                    "sharedText",
                    {
                        config: workerConfig,
                        id,
                        loadPartial: false,
                        options: JSON.stringify(options),
                        pageInk: request.query.pageInk === "true",
                        partials: defaultPartials,
                        template,
                        title: request.params.id,
                        version: JSON.stringify(version),
                    });
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}
