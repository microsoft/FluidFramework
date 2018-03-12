import { Router } from "express";
import * as moniker from "moniker";
import { ensureAuthenticated } from "./authCheker";
import { defaultPartials } from "./partials";

function renderView(request, response, docId: string, config: any) {
    response.render(
        "cells",
        {
            id: docId,
            partials: defaultPartials,
        },
    );
}

export function create(config: any): Router {
    const router: Router = Router();

    router.get("/", (request, response, next) => {
        response.redirect(`/cells/${moniker.choose()}`);
    });

    router.get("/:id", ensureAuthenticated, (request, response, next) => {
        renderView(request, response, request.params.id, config);
    });

    return router;
}
