import { Router } from "express";
import * as moniker from "moniker";
import { Provider } from "nconf";
import { defaultPartials } from "./partials";

const defaultSpeed = 50;
const defaultTemplate = "/public/literature/resume.txt";

export function create(config: Provider) {
    const router: Router = Router();

    const workerConfig = JSON.stringify(config.get("worker"));

    function handleResponse(
        response,
        speed: number = defaultSpeed,
        languages: string = "",
        id?: string,
        template?: string) {

        response.render(
            "scribe",
            {
                config: workerConfig,
                fileLoad: !id,
                id,
                languages,
                partials: defaultPartials,
                speed,
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
        const speed = Number.parseFloat(request.query.speed) || defaultSpeed;
        const text = request.query.text || defaultTemplate;
        const languages = request.query.language || "";

        handleResponse(response, speed, languages, moniker.choose(), text);
    });

    return router;
}
