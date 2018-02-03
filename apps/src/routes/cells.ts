import { Router } from "express";
import { defaultPartials } from "./partials";

export function create(config: any): Router {
    const router: Router = Router();

    router.get("/:id", (request, response, next) => {
        response.render(
            "cells",
            {
                endpoints: JSON.stringify(config.endpoints),
                id: request.params.id,
                partials: defaultPartials,
                repository: config.repository,
                title: request.params.id,
                token: request.query.token,
                workerConfig: JSON.stringify(config.worker),
            },
        );
    });

    return router;
}
