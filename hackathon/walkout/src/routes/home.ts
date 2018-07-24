import { Router } from "express";
import { Provider } from "nconf";
import { GitHub } from "../github";

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

    router.get("/repos", ensureLoggedIn(), (request, response) => {
        const gitHub = new GitHub(request.user.accessToken);
        gitHub.getRepos().then(
            (repos: any[]) => {
                const names = repos.map((repo) => repo.full_name);

                response.render(
                    "repos",
                    {
                        partials: {
                            layout: "layout",
                        },
                        repos: names,
                        title: "Walkout",
                    });
            });
    });

    return router;
}
