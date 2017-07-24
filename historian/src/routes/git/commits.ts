import { Router } from "express";
import * as nconf from "nconf";
import * as git from "nodegit";
import * as path from "path";
import * as winston from "winston";
import { commitToICommit, ICommit, ICreateCommitParams } from "../../resources";
import * as utils from "../../utils";

async function createCommit(gitDir: string, repo: string, blob: ICreateCommitParams): Promise<ICommit> {
    const date = Date.parse(blob.author.date);
    if (isNaN(date)) {
        return Promise.reject("Invalid input");
    }

    const repository = await utils.openRepo(gitDir, repo);
    // TODO detect timezone information in date string rather than specifying UTC by default
    const signature = git.Signature.create(blob.author.name, blob.author.email, Math.floor(date), 0);
    const parents = blob.parents && blob.parents.length > 0 ? blob.parents : null;
    const commit = await repository.createCommit(null, signature, signature, blob.message, blob.tree, parents);

    return {
        sha: commit.tostrS(),
        url: "",
    };
}

async function getCommit(gitDir: string, repo: string, sha: string): Promise<ICommit> {
    const repository = await utils.openRepo(gitDir, repo);
    const commit = await repository.getCommit(sha);

    winston.info(commit.message());
    const author = commit.author();
    winston.info(JSON.stringify(author));

    return commitToICommit(commit);
}

export function create(store: nconf.Provider): Router {
    const gitDir = path.resolve(store.get("storageDir"));

    const router: Router = Router();

    // * https://developer.github.com/v3/git/commits/

    router.post("/repos/:repo/git/commits", (request, response, next) => {
        const blobP = createCommit(gitDir, request.params.repo, request.body as ICreateCommitParams);
        return blobP.then(
            (blob) => {
                response.status(201).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    router.get("/repos/:repo/git/commits/:sha", (request, response, next) => {
        const blobP = getCommit(gitDir, request.params.repo, request.params.sha);
        return blobP.then(
            (blob) => {
                response.status(200).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}
