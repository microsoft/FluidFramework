import { Router } from "express";
import { ensureAuthenticated } from "./authCheker";
import { defaultPartials } from "./partials";

function renderView(viewName: string, request, response, docId: string, config: any) {
    response.render(
        viewName,
        {
            endpoints: JSON.stringify(config.tenantInfo.endpoints),
            id: docId,
            partials: defaultPartials,
            tenantId: config.tenantInfo.id,
            title: docId,
            token: request.query.token,
        },
    );
}

export function create(config: any): Router {
    const router: Router = Router();

    router.get("/mcq/edit/:id", ensureAuthenticated(config.tenantInfo.id, config.tenantInfo.secretKey),
              (request, response, next) => {
        request.query.token = response.locals.token;
        const docId = request.params.id;
        renderView("editquiz", request, response, docId, config);
    });

    router.get("/mcq/view/:id", ensureAuthenticated(config.tenantInfo.id, config.tenantInfo.secretKey),
              (request, response, next) => {
        request.query.token = response.locals.token;
        const docId = request.params.id;
        renderView("viewquiz", request, response, docId, config);
    });

    return router;
}
