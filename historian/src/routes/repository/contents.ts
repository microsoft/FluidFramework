import { Router } from "express";
import * as nconf from "nconf";
import * as git from "nodegit";
import * as path from "path";
import * as resources from "../../resources";
import * as utils from "../../utils";

async function getContent(gitDir: string, repo: string, contentPath: string, ref: string): Promise<any> {
    const repository = await utils.openRepo(gitDir, repo);
    const revObj = await git.Revparse.single(repository, `${ref}:${contentPath}`);

    // TODO switch on the type of object
    const blob = await repository.getBlob(revObj.id());
    return resources.blobToIBlob(blob, repo);
}

export function create(store: nconf.Provider): Router {
    const gitDir = path.resolve(store.get("storageDir"));

    const router: Router = Router();

    router.get("/repos/:repo/contents/*", (request, response, next) => {
        const resultP = getContent(gitDir, request.params.repo, request.params[0], request.query.ref);
        return resultP.then(
            (blob) => {
                response.status(200).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}
