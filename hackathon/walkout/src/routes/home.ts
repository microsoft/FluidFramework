import { Router } from "express";
import { Provider } from "nconf";

export function create(config: Provider, ensureLoggedIn: any): Router {
    const router: Router = Router();

    router.get("/", ensureLoggedIn(), (request, response, next) => {
        response.render(
            "home",
            {
                partials: {
                    layout: "layout",
                },
                title: "Walkout",
            });
    });

    return router;
}
