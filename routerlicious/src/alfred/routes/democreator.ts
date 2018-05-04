import * as ensureAuth from "connect-ensure-login";
import { Router } from "express";
import * as moniker from "moniker";
import { Provider } from "nconf";
import { defaultPartials } from "./partials";

export function create(config: Provider): Router {
    const router: Router = Router();
    const ensureLoggedIn = ensureAuth.ensureLoggedIn;

    /**
     * Loading the demo creator page.
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
     * Loading the demo creator page.
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

    return router;
}
