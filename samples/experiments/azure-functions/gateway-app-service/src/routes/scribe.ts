import { IAlfredTenant } from "@prague/services-core";
import { Request, Response, Router } from "express";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";
import { Provider } from "nconf";
import { parse } from "url";
import * as utils from "../utils";
import { defaultPartials } from "./partials";

const defaultSpeed = 50;
const defaultAuthors = 1;
const defaultTemplate = "/public/literature/resume.txt";

export function create(
    config: Provider,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any,
) {
    const router: Router = Router();

    function handleResponse(
        request: Request,
        response: Response,
        speed: number = defaultSpeed,
        authors: number = defaultAuthors,
        languages: string = "",
        id?: string,
        template?: string,
        tenantId = appTenants[0].id) {

        const jwtToken = jwt.sign(
            {
                user: request.user,
            },
            config.get("gateway:key"));

        const workerConfig = utils.getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));
        const baseUrl = `prague://` +
            `${parse(config.get("worker:serverUrl")).host}/` +
            `${encodeURIComponent(tenantId)}`;

        response.render(
            "scribe",
            {
                authors,
                baseUrl,
                config: workerConfig,
                fileLoad: !id,
                id,
                jwt: jwtToken,
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
    router.get("/", ensureLoggedIn(), (request, response, next) => {
        handleResponse(request, response);
    });

    /**
     * Script entry point root
     */
    router.get("/demo/:tenantId?", ensureLoggedIn(), (request, response, next) => {
        const speed = Number.parseFloat(request.query.speed) || defaultSpeed;
        const authors = Number.parseFloat(request.query.authors) || defaultAuthors;
        const text = request.query.text || defaultTemplate;
        const languages = request.query.language ? request.query.language : "";

        handleResponse(request, response, speed, authors, languages, moniker.choose(), text, request.params.tenantId);
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
