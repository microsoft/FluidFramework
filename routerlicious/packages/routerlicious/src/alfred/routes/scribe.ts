import { Router } from "express";
import * as moniker from "moniker";
import { Provider } from "nconf";
import { ITenantManager } from "../../core";
import { IAlfredTenant } from "../tenant";
import * as utils from "../utils";
import { defaultPartials } from "./partials";

const defaultSpeed = 50;
const defaultAuthors = 1;
const defaultTemplate = "/public/literature/resume.txt";

export function create(config: Provider, tenantManager: ITenantManager,
                       appTenants: IAlfredTenant[], ensureLoggedIn: any) {
    const router: Router = Router();

    function handleResponse(
        response,
        speed: number = defaultSpeed,
        authors: number = defaultAuthors,
        languages: string = "",
        id?: string,
        template?: string,
        tenantId = appTenants[0].id) {

        const workerConfigP = utils.getConfig(
            config.get("worker"),
            tenantManager,
            tenantId,
            config.get("error:track"),
            config.get("client"));
        workerConfigP.then(
            (workerConfig) => {
                const token = utils.getToken(tenantId, id, appTenants);
                const metricsToken = utils.getToken(tenantId, `${id}-metrics`, appTenants);

                response.render(
                    "scribe",
                    {
                        authors,
                        config: workerConfig,
                        fileLoad: !id,
                        id,
                        languages,
                        metricsToken,
                        partials: defaultPartials,
                        speed,
                        template,
                        title: "Scribe",
                        token,
                    });
            },
            (error) => {
                response.status(400).json(error);
            });
    }

    /**
     * Script entry point root
     */
    router.get("/", ensureLoggedIn(), (request, response, next) => {
        handleResponse(response);
    });

    /**
     * Script entry point root
     */
    router.get("/demo/:tenantId?", ensureLoggedIn(), (request, response, next) => {
        const speed = Number.parseFloat(request.query.speed) || defaultSpeed;
        const authors = Number.parseFloat(request.query.authors) || defaultAuthors;
        const text = request.query.text || defaultTemplate;
        const languages = request.query.language || "";

        handleResponse(response, speed, authors, languages, moniker.choose(), text, request.params.tenantId);
    });

    router.get("/mercator", ensureLoggedIn(), (request, response, next) => {
        response.render(
            "mercator",
            {
                partials: defaultPartials,
                title: "Mercator",
            });
    });

    return router;
}
