import { Router } from "express";
import * as nconf from "nconf";
import { defaultPartials } from "./partials";

const router: Router = Router();

const config = JSON.stringify(nconf.get("worker"));

/**
 * Script entry point root
 */
router.get("/", (request, response, next) => {
    response.render(
        "scribe",
        {
            config,
            id: request.params.id,
            partials: defaultPartials,
            title: "Scribe",
        });
});

export default router;
