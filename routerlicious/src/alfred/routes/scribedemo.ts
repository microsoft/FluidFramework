import { Router } from "express";
import * as moniker from "moniker";
import { Provider } from "nconf";
import * as path from "path";
import { defaultPartials } from "./partials";

const defaultTemplate = "resume.txt";

export function create(config: Provider) {
    const router: Router = Router();

    const workerConfig = JSON.stringify(config.get("worker"));

    /**
     * Script entry point root
     */
    router.get("/", (request, response, next) => {
        const parsedTemplate = path.parse(defaultTemplate);
        const template =
            parsedTemplate.base !== "empty" ? `/public/literature/${parsedTemplate.base}` : undefined;
        response.render(
            "scribedemo",
            {
                config: workerConfig,
                id: moniker.choose(),
                partials: defaultPartials,
                template,
                title: "Scribe Demo",
            });
    });

    return router;
}
