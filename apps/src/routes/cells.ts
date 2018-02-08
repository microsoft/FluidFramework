import { Router } from "express";
import * as moniker from "moniker";
import { ensureAuthenticated } from "./authCheker";
import { defaultPartials } from "./partials";

function renderView(request, response, id: string, config: any) {
    response.render(
        "cells",
        {
            endpoints: JSON.stringify(config.endpoints),
            id,
            owner: config.owner,
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
        response.redirect(`/cells/${moniker.choose()}`);
    });

    router.get("/:id", ensureAuthenticated, (request, response, next) => {
        request.query.token = response.locals.token;
        renderView(request, response, request.params.id, config);
    });

    return router;
}
