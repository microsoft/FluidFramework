import { Router } from "express";
import { ensureAuthenticated } from "./authCheker";
import { defaultPartials } from "./partials";

const endpoints = {
    delta: "https://alfred.wu2-ppe.prague.office-int.com",
    storage: "https://historian.wu2-ppe.prague.office-int.com",
};

function renderView(viewName: string, type: string, request, response, docId: string, config: any) {
    response.render(
        viewName,
        {
            endpoints: JSON.stringify(endpoints),
            id: docId,
            partials: defaultPartials,
            tenantId: "thirsty-shirley",
            title: docId,
            token: request.query.token,
            type,
        },
    );
}

export function create(config: any): Router {
    const router: Router = Router();

    router.get("/mcq/edit/:id", ensureAuthenticated("thirsty-shirley", "f793c1603cf75ea41a09804e94f43cd2"),
              (request, response, next) => {
        request.query.token = response.locals.token;
        const docId = request.params.id;
        renderView("choicequiz", "mcq/edit", request, response, docId, config);
    });

    router.get("/mcq/view/:id", ensureAuthenticated("thirsty-shirley", "f793c1603cf75ea41a09804e94f43cd2"),
              (request, response, next) => {
        request.query.token = response.locals.token;
        const docId = request.params.id;
        renderView("choicequiz", "mcq/view", request, response, docId, config);
    });

    return router;
}
