// Load environment varaibles and pass to the controller.
import { Router } from "express";
import * as nconf from "nconf";
import * as git from "../../git-storage";
import * as storage from "../storage";
import { defaultPartials } from "./partials";

const router: Router = Router();

const settings = nconf.get("git");
const gitManager = new git.GitManager(settings.historian, settings.repository);

/**
 * Loading of a specific collaborative map
 */
router.get("/:id", (request, response, next) => {
    const versionP = storage.getLatestVersion(gitManager, request.params.id);

    const config = JSON.stringify(nconf.get("worker"));
    versionP.then(
        (version) => {
            response.render(
                "maps",
                {
                    id: request.params.id,
                    config,
                    partials: defaultPartials,
                    title: request.params.id,
                    version: JSON.stringify(version),
                });
        },
        (error) => {
            response.status(400).json(error);
        });
});

export default router;
