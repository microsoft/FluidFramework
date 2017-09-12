import { Router } from "express";
import { Provider } from "nconf";
import { defaultPartials } from "./partials";

export function create(config: Provider) {
    const router: Router = Router();

    const workerConfig = JSON.stringify(config.get("worker"));

    /**
     * Script entry point root
     */
    router.get("/", (request, response, next) => {
        response.render(
            "scribe",
            {
                config: workerConfig,
                id: request.params.id,
                partials: defaultPartials,
                title: "Scribe",
            });
    });

    return router;
}
