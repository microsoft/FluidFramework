import { Router } from "express";
import * as nconf from "nconf";
import { ICreateRepoParams } from "../../resources";
import * as utils from "../../utils";

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): Router {
    const router: Router = Router();

    /**
     * Creates a new git repository
     */
    router.post("/repos", (request, response, next) => {
        const createParams = request.body as ICreateRepoParams;
        if (!createParams || !createParams.name) {
            return response.status(400).json("Invalid repo name");
        }

        const repoP = repoManager.create(createParams.name);
        repoP.then(
            (repository) => {
                return response.status(201).json();
            },
            (error) => {
                return response.status(400).json();
            });
    });

    /**
     * Retrieves an existing get repository
     */
    router.get("/repos/:repo", (request, response, next) => {
        const repoP = repoManager.open(request.params.repo);
        repoP.then(
            (repository) => {
                return response.status(200).json({ name: request.params.repo });
            },
            (error) => {
                return response.status(400).end();
            });
    });

    return router;
}
