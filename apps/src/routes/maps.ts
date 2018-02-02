import { Router } from "express";
import { Provider } from "nconf";
import { defaultPartials } from "./partials";

export function create(config: Provider): Router {
    const router: Router = Router();

    router.get("/:id", (request, response, next) => {
        response.render(
            "maps",
            {
                endpoints: JSON.stringify(config.get("endpoints")),
                id: request.params.id,
                partials: defaultPartials,
                repository: config.get("repository"),
                title: request.params.id,
                token: request.query.token,
                workerConfig: JSON.stringify(config.get("worker")),
            },
        );
    });

    return router;
}
