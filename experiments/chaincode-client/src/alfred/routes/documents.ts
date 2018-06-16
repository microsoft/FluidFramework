import { Router } from "express";
import { Provider } from "nconf";

export function create(config: Provider): Router {
    const router: Router = Router();

    router.get("/:tenantId?/:id", (request, response, next) => {
        // I don't think I actually need this one...
        response.status(200).json(null);
    });

    return router;
}
