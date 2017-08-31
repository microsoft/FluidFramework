// Load environment varaibles and pass to the controller.
import { Router } from "express";
import * as nconf from "nconf";
import { defaultPartials } from "./partials";

const router: Router = Router();

/**
 * Loading of a specific collaborative map
 */
router.get("/", (request, response, next) => {
    const config = JSON.stringify(nconf.get("worker"));
    response.render(
        "login",
        {
            config,
            optionalBodyClass: "loginbody",
            partials: defaultPartials,
            title: request.params.id,
        });
});

export default router;
