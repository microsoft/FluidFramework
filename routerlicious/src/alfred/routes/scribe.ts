import { Router } from "express";
import * as moniker from "moniker";
import { Provider } from "nconf";
import { defaultPartials } from "./partials";

const defaultTemplate = "/public/literature/resume.txt";

export function create(config: Provider) {
    const router: Router = Router();

    const workerConfig = JSON.stringify(config.get("worker"));

    function handleResponse(response, id?: string, template?: string) {
        response.render(
            "scribe",
            {
                config: workerConfig,
                fileLoad: !id,
                id,
                partials: defaultPartials,
                template,
                title: "Scribe",
            });
    }

    /**
     * Script entry point root
     */
    router.get("/", (request, response, next) => {
        handleResponse(response);
    });

    /**
     * Script entry point root
     */
    router.get("/demo", (request, response, next) => {
        handleResponse(response, moniker.choose(), defaultTemplate);
    });

    return router;
}
