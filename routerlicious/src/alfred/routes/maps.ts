// Load environment varaibles and pass to the controller.
import { Router } from "express";
import { Provider } from "nconf";
import * as git from "../../git-storage";
import * as storage from "../storage";
import { defaultPartials } from "./partials";

export function create(config: Provider, gitManager: git.GitManager): Router {
    const router: Router = Router();

    /**
     * Loading of a specific collaborative map
     */
    router.get("/:id", (request, response, next) => {
        const versionP = storage.getLatestVersion(gitManager, request.params.id);

        const workerConfig = JSON.stringify(config.get("worker"));
        versionP.then(
            (version) => {
                response.render(
                    "maps",
                    {
                        config: workerConfig,
                        id: request.params.id,
                        partials: defaultPartials,
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
