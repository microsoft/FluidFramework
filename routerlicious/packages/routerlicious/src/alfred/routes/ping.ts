import { Router } from "express";
import { defaultPartials } from "./partials";

export function create(): Router {
    const router: Router = Router();

    /**
     * Loading of a specific collaborative map
     */
    router.get("/", (request, response, next) => {
        response.render(
            "ping",
            {
                partials: defaultPartials,
            });
    });

    return router;
}
