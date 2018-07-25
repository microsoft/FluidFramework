import { Router } from "express";
import { Provider } from "nconf";
import { GitHub, IPassportUser } from "../github";

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

    router.get("/me", ensureLoggedIn(), (request, response) => {
        const user = request.user.profile as IPassportUser;

        response.render(
            "me",
            {
                partials: {
                    layout: "layout",
                },
                profile: JSON.stringify(user._json),
                title: "Walkout",
            });
    });

    router.get("/walkout/:id", ensureLoggedIn(), (request, resposne) => {
        resposne.render(
            "walkout",
            {
                id: request.params.id,
                partials: {
                    layout: "layout",
                },
                title: "Walkout",
            });
    });

    return router;
}
