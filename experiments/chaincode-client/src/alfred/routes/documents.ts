import { Router } from "express";
import { Provider } from "nconf";

export function create(config: Provider): Router {
    const router: Router = Router();

    router.get("/:tenantId?/:id", (request, response, next) => {
        response.status(200).json(null);
    });

    return router;
}
