import { Router } from "express";
import * as moniker from "moniker";
import * as bot from "../tictacbot";
import { getFullId } from "../utils";
import { ensureAuthenticated } from "./authCheker";
import { defaultPartials } from "./partials";

function renderView(request, response, docId: string, config: any) {
    response.render(
        "tictactoe",
        {
            endpoints: JSON.stringify(config.tenantInfo.endpoints),
            id: docId,
            owner: config.tenantInfo.owner,
            partials: defaultPartials,
            repository: config.tenantInfo.repository,
            title: docId,
            token: request.query.token,
        },
    );
}

export function create(config: any): Router {
    const router: Router = Router();

    router.get("/", (request, response, next) => {
        response.redirect(`/tictactoe/${moniker.choose()}`);
    });

    router.get("/:id", ensureAuthenticated, (request, response, next) => {
        request.query.token = response.locals.token;
        const docId = getFullId(config.tenantInfo.id, request.params.id);
        renderView(request, response, docId, config);
        if (request.query.player === "single") {
            bot.start(docId, config.tenantInfo.repository, config.tenantInfo.owner, config.tenantInfo.endpoints);
        }
    });

    return router;
}
