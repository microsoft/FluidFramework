// Load environment varaibles and pass to the controller.
import { Router } from "express";
import { Provider } from "nconf";
import { defaultPartials } from "./partials";

export function create(config: Provider): Router {
    const router: Router = Router();

    /**
     * Loading of a specific collaborative map
     */
    router.get("/", (request, response, next) => {
        const workerConfig = JSON.stringify(config.get("worker"));
        response.render(
            "login",
            {
                config: workerConfig,
                optionalBodyClass: "loginbody",
                partials: defaultPartials,
                title: request.params.id,
            });
    });

    return router;
}
