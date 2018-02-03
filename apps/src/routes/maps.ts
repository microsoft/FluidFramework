import { Router } from "express";
import * as moniker from "moniker";
import { defaultPartials } from "./partials";

function renderView(request, response, id: string, config: any) {
    response.render(
        "maps",
        {
            endpoints: JSON.stringify(config.endpoints),
            id,
            partials: defaultPartials,
            repository: config.repository,
            title: id,
            token: request.query.token,
            workerConfig: JSON.stringify(config.worker),
        },
    );
}

export function create(config: any): Router {
    const router: Router = Router();

    router.get("/", (request, response, next) => {
        response.redirect(`/maps/${moniker.choose()}`);
    });

    router.get("/:id", (request, response, next) => {
        renderView(request, response, request.params.id, config);
    });

    return router;
}
