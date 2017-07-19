import { Router } from "express";
import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
import * as utils from "../utils";

export interface IBlob {
    content: string;
    encoding: string;
    url: string;
    sha: string;
    size: number;
}

export interface ICreateBlobParams {
    // The encoded content
    content: string;

    // The encoding of the content. Either utf8 or base64.
    encoding: string;
}

export interface ICreateBlobResponse {
    sha: string;
    url: string;
}

/**
 * Validates that the input encoding is valid
 */
function validateEncoding(encoding: string) {
    return encoding === "utf-8" || encoding === "base64";
}

async function getBlob(gitDir: string, repo: string, sha: string): Promise<IBlob> {
    const repository = await utils.openRepo(gitDir, repo);
    const blob = await repository.getBlob(sha);

    const buffer = blob.content();

    return {
        content: buffer.toString("base64"),
        encoding: "base64",
        sha,
        size: buffer.length,
        url: `/repos/${repo}/git/blobs/${sha}`,
    };
}

async function createBlob(gitDir: string, repo: string, blob: ICreateBlobParams): Promise<ICreateBlobResponse> {
    if (!blob || !blob.content || !validateEncoding(blob.encoding)) {
        return Promise.reject("Invalid blob");
    }

    const repository = await utils.openRepo(gitDir, repo);
    winston.info(`Opened ${repo}`);
    const id = repository.createBlobFromBuffer(new Buffer(blob.content, blob.encoding));
    const sha = id.tostrS();

    return {
        sha,
        url: `/repos/${repo}/git/blobs/${sha}`,
    };
}

export function create(store: nconf.Provider): Router {
    const gitDir = path.resolve(store.get("storageDir"));

    const router: Router = Router();

    router.post("/repos/:repo/git/blobs", (request, response, next) => {
        const blobP = createBlob(gitDir, request.params.repo, request.body as ICreateBlobParams);
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
        const blobP = getBlob(gitDir, request.params.repo, request.params.sha);
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
