import { Router } from "express";
import { ensureAuthenticated } from "./authCheker";
import { defaultPartials } from "./partials";

function renderView(viewName: string, type: string, request, response, docId: string, config: any) {
    response.render(
        viewName,
        {
            endpoints: JSON.stringify(config.tenantInfo.endpoints),
            id: docId,
            partials: defaultPartials,
            tenantId: config.tenantInfo.id,
            title: docId,
            token: request.query.token,
            type,
        },
    );
}

export function create(config: any): Router {
    const router: Router = Router();

    router.get("/mcq/edit/:id", ensureAuthenticated(config.tenantInfo.id, config.tenantInfo.secretKey),
              (request, response, next) => {
        request.query.token = response.locals.token;
        const docId = request.params.id;
        renderView("choicequiz", "mcq/edit", request, response, docId, config);
    });

    router.get("/mcq/view/:id", ensureAuthenticated(config.tenantInfo.id, config.tenantInfo.secretKey),
              (request, response, next) => {
        request.query.token = response.locals.token;
        const docId = request.params.id;
        renderView("choicequiz", "mcq/view", request, response, docId, config);
    });

    return router;
}
