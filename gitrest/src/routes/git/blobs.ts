import { Router } from "express";
import * as nconf from "nconf";
import * as winston from "winston";
import { blobToIBlob, IBlob, ICreateBlobParams, ICreateBlobResponse } from "../../resources";
import * as utils from "../../utils";

/**
 * Validates that the input encoding is valid
 */
function validateEncoding(encoding: string) {
    return encoding === "utf-8" || encoding === "base64";
}

async function getBlob(repoManager: utils.RepositoryManager, repo: string, sha: string): Promise<IBlob> {
    const repository = await repoManager.open(repo);
    const blob = await repository.getBlob(sha);

    return blobToIBlob(blob, repo);
}

async function createBlob(
    repoManager: utils.RepositoryManager,
    repo: string,
    blob: ICreateBlobParams): Promise<ICreateBlobResponse> {

    if (!blob || !blob.content || !validateEncoding(blob.encoding)) {
        return Promise.reject("Invalid blob");
    }

    const repository = await repoManager.open(repo);
    winston.info(`Opened ${repo}`);
    const id = repository.createBlobFromBuffer(new Buffer(blob.content, blob.encoding));
    const sha = id.tostrS();

    return {
        sha,
        url: `/repos/${repo}/git/blobs/${sha}`,
    };
}

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): Router {
    const router: Router = Router();

    router.post("/repos/:repo/git/blobs", (request, response, next) => {
        const blobP = createBlob(repoManager, request.params.repo, request.body as ICreateBlobParams);
        return blobP.then(
            (blob) => {
                response.status(201).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    /**
     * Retrieves the given blob from the repository
     */
    router.get("/repos/:repo/git/blobs/:sha", (request, response, next) => {
        const blobP = getBlob(repoManager, request.params.repo, request.params.sha);
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
