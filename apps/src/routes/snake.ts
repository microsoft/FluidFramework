import { Router } from "express";
import * as moniker from "moniker";
import { ensureAuthenticated } from "./authCheker";
import { defaultPartials } from "./partials";

function renderView(request, response, docId: string, config: any) {
    response.render(
        "snake",
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
        const queryParam = request.query.player ? `?player=${request.query.player}` : "";
        response.redirect(`/snake/${moniker.choose()}${queryParam}`);
    });

    router.get("/:id", ensureAuthenticated(config.tenantInfo.id, config.tenantInfo.secretKey),
               (request, response, next) => {
        request.query.token = response.locals.token;
        const docId = request.params.id;
        renderView(request, response, docId, config);
        // Start a bot for single players.
        if (request.query.player === "single") {
            console.log("single player");
        }
    });

    return router;
}
