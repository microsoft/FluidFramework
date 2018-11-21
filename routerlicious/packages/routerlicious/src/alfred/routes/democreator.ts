import { Router } from "express";
import * as moniker from "moniker";
import { Provider } from "nconf";
import { defaultPartials } from "./partials";

export function create(config: Provider, ensureLoggedIn: any): Router {
    const router: Router = Router();

    /**
     * Original Prague demos from December of 2017
     */
    router.get("/", ensureLoggedIn(), (request, response, next) => {
        response.render(
            "demos/dec2017",
            {
                canvasMoniker: moniker.choose(),
                composeMoniker: moniker.choose(),
                emptyMoniker: moniker.choose(),
                noComposeMoniker: moniker.choose(),
                partials: defaultPartials,
                sharedTextMoniker: moniker.choose(),
                sharedTextPageInkMoniker: moniker.choose(),
                title: "Prague Demos",
                videoMoniker: moniker.choose(),
            });
    });

    /**
     * Executive retreat 2018 demos
     */
    router.get("/retreat", ensureLoggedIn(), (request, response, next) => {
        response.render(
            "demos/retreat",
            {
                emptyMoniker: moniker.choose(),
                partials: defaultPartials,
                sharedTextMoniker: moniker.choose(),
                title: "Prague Demos",
                translateMoniker: moniker.choose(),
            });
    });

    /**
     * Fall 2018 demos
     */
    router.get("/fall2018", ensureLoggedIn(), (request, response, next) => {
        response.render(
            "demos/fall2018",
            {
                chartsMoniker: moniker.choose(),
                componentsMoniker: moniker.choose(),
                monacoMoniker: moniker.choose(),
                napoleonMoniker: moniker.choose(),
                partials: defaultPartials,
                pinpointMoniker: moniker.choose(),
                pollMoniker: moniker.choose(),
                title: "Prague Demos",
            });
    });

    return router;
}
