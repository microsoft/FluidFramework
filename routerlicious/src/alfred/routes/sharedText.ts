import { Router } from "express";
import { Provider } from "nconf";
import * as path from "path";
import * as git from "../../git-storage";
import * as storage from "../storage";
import { defaultPartials } from "./partials";

const defaultTemplate = "pp.txt";

export function create(config: Provider, gitManager: git.GitManager): Router {
    const router: Router = Router();
    const workerConfig = JSON.stringify(config.get("worker"));

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
     * Just to view the list of commits
     * TODO: Remove later.
     */
    router.get("/:id/commits", (request, response, next) => {
        const versionsP = storage.getAllVersions(gitManager, request.params.id);
        versionsP.then(
            (versions) => {
                console.log(`All commits: ${JSON.stringify(versions)}`);
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
        console.log(targetVersionSha);
        const versionsP = storage.getAllVersions(gitManager, request.params.id);
        versionsP.then(
            (versions) => {
                for (let version of versions) {
                    if (version.sha === targetVersionSha) {
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
                    }
                }
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}
