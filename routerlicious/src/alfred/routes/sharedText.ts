import { Router } from "express";
import { Provider } from "nconf";
import * as path from "path";
import * as git from "../../git-storage";
import * as utils from "../../utils";
import * as storage from "../storage";
import { defaultPartials } from "./partials";

const defaultTemplate = "pp.txt";

export function create(
    config: Provider,
    gitManager: git.GitManager,
    mongoManager: utils.MongoManager,
    producer: utils.kafkaProducer.IProducer): Router {
    const router: Router = Router();
    const workerConfig = JSON.stringify(config.get("worker"));

    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    /**
     * Loading of a specific shared text.
     */
    router.get("/:id", (request, response, next) => {

        const versionP = storage.getLatestVersion(gitManager, request.params.id);
        versionP.then(
            (version) => {
                const parsedTemplate = path.parse(request.query.template ? request.query.template : defaultTemplate);
                const template =
                    parsedTemplate.base !== "empty" ? `/public/literature/${parsedTemplate.base}` : undefined;

                response.render(
                    "sharedText",
                    {
                        config: workerConfig,
                        id: request.params.id,
                        loadPartial: false,
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

    /**
     * Loads count number of latest commits.
     */
    router.get("/:id/commits", (request, response, next) => {
        const versionsP = storage.getVersions(gitManager, request.params.id, 10);
        versionsP.then(
            (versions) => {
                response.render(
                    "commits",
                    {
                        id: request.params.id,
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
    router.get("/:id/commit", (request, response, next) => {
        const targetVersionSha = request.query.version;
        const versionP = storage.getVersion(gitManager, targetVersionSha);
        versionP.then(
            (version) => {
                response.render(
                    "sharedText",
                    {
                        config: workerConfig,
                        id: request.params.id,
                        loadPartial: true,
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

    router.post("/:id/fork", (request, response, next) => {
        const forkP = storage.createFork(
            producer,
            gitManager,
            mongoManager,
            documentsCollectionName,
            request.params.id);
        forkP.then(
            (fork) => {
                response.redirect(`/sharedText/${fork}`);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}
