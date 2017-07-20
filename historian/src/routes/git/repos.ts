import { Router } from "express";
import * as nconf from "nconf";
import * as git from "nodegit";
import * as path from "path";
import { ICreateRepoParams } from "../../resources";
import * as utils from "../../utils";

export function create(store: nconf.Provider): Router {
    const gitDir = path.resolve(store.get("storageDir"));

    const router: Router = Router();

    /**
     * Creates a new git repository
     */
    router.post("/repos", (request, response, next) => {
        const createParams = request.body as ICreateRepoParams;
        if (!createParams || !createParams.name) {
            return response.status(400).json("Invalid repo name");
        }

        const parsed = path.parse(createParams.name);
        if (parsed.dir !== "") {
            return response.status(400).json("Invalid repo name");
        }

        const isBare: any = 1;
        const initP = git.Repository.init(`${gitDir}/${parsed.base}`, isBare);
        initP.then(
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
        const repoP = utils.openRepo(gitDir, request.params.repo);
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
