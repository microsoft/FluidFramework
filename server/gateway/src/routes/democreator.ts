/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import * as moniker from "moniker";
import { getUserDetails, getVersion } from "../utils";
import { defaultPartials } from "./partials";

export function create(ensureLoggedIn: any): Router {
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
                scribeMoniker: moniker.choose(),
                sharedTextMoniker: moniker.choose(),
                sharedTextPageInkMoniker: moniker.choose(),
                title: "Prague Demos",
                user: getUserDetails(request),
                version: getVersion(),
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
                scribeMoniker: moniker.choose(),
                title: "Prague Demos",
                user: getUserDetails(request),
                translateMoniker: moniker.choose(),
                version: getVersion(),
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
                user: getUserDetails(request),
                version: getVersion(),
            });
    });

    /**
     * Winter 2019 demos
     */
    router.get("/winter2019", ensureLoggedIn(), (request, response, next) => {
        response.render(
            "demos/winter2019",
            {
                chartMonacoMoniker: moniker.choose(),
                inkMoniker: moniker.choose(),
                newsMoniker: moniker.choose(),
                partials: defaultPartials,
                pinpointMoniker: moniker.choose(),
                scribeMoniker: moniker.choose(),
                sharedTextMoniker: moniker.choose(),
                title: "Prague Demos",
                translateMoniker: moniker.choose(),
                user: getUserDetails(request),
                version: getVersion(),
            });
    });

    /**
     * Spring 2019 demos
     */
    router.get("/spring2019", ensureLoggedIn(), (request, response, next) => {
        response.render(
            "demos/spring2019",
            {
                chartMonacoMoniker: moniker.choose(),
                inkMoniker: moniker.choose(),
                mathMoniker: moniker.choose(),
                partials: defaultPartials,
                sharedTextMoniker: moniker.choose(),
                title: "Fluid Demos",
                user: getUserDetails(request),
                version: getVersion(),
            });
    });

    return router;
}
