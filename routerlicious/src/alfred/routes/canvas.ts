import { Router } from "express";
import * as nconf from "nconf";
import { defaultPartials } from "./partials";

const router: Router = Router();

/**
 * Loading of a specific collaborative map
 */
router.get("/:id?", (request, response, next) => {
    const id = request.params.id ? request.params.id : "test";
    const config = JSON.stringify(nconf.get("worker"));
    const encrypted = request.query.encrypted ? true : false;

    response.render(
        "canvas",
        {
            id,
            config,
            partials: defaultPartials,
            title: id,
            encrypted,
        });
});

export default router;
