import { Router } from "express";
import * as moniker from "moniker";
import { ensureAuthenticated } from "./authCheker";
import { defaultPartials } from "./partials";

function renderView(request, response, id: string, config: any) {
    const options = {
        spellchecker: "enabled",
    };
    response.render(
        "sharedText",
        {
            disableCache: false,
            endpoints: JSON.stringify(config.endpoints),
            id,
            options: JSON.stringify(options),
            owner: config.owner,
            pageInk: true,
            partials: defaultPartials,
            repository: config.repository,
            template: `/public/literature/pp.txt`,
            title: id,
            token: request.query.token,
            workerConfig: JSON.stringify(config.worker),
        },
    );
}

export function create(config: any): Router {
    const router: Router = Router();

    router.get("/", (request, response, next) => {
        response.redirect(`/sharedText/${moniker.choose()}`);
    });

    router.get("/:id", ensureAuthenticated, (request, response, next) => {
        request.query.token = response.locals.token;
        renderView(request, response, request.params.id, config);
    });

    return router;
}
