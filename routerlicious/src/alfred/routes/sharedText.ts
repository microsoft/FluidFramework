// Load environment varaibles and pass to the controller.
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../../config.json")).use("memory");

import { Router } from "express";
import { defaultPartials } from "./partials";

const router: Router = Router();

/**
 * Loading of a specific collaborative map
 */
router.get("/:id", (request, response, next) => {
    const config = JSON.stringify(nconf.get("worker"));
    response.render(
        "sharedText",
        {
            id: request.params.id,
            config,
            partials: defaultPartials,
            title: request.params.id,
        });
});

export default router;
