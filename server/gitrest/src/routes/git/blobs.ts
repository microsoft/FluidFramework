/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBlob, ICreateBlobParams, ICreateBlobResponse } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import * as utils from "../../utils";

/**
 * Validates that the input encoding is valid
 */
function validateEncoding(encoding: string): encoding is BufferEncoding {
    return encoding === "utf-8" || encoding === "base64";
}

function validateBlob(blob: string): boolean {
    // eslint-disable-next-line no-null/no-null
    return blob !== undefined && blob !== null;
}

export async function getBlob(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    sha: string): Promise<IBlob> {
    const repository = await repoManager.open(owner, repo);
    const blob = await repository.getBlob(sha);

    return utils.blobToIBlob(blob, owner, repo);
}

export async function createBlob(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    blob: ICreateBlobParams): Promise<ICreateBlobResponse> {
        if (!blob || !validateBlob(blob.content) || !validateEncoding(blob.encoding)) {
            // eslint-disable-next-line prefer-promise-reject-errors
            return Promise.reject("Invalid blob");
    }

    const repository = await repoManager.open(owner, repo);
    const id = await repository.createBlobFromBuffer(Buffer.from(blob.content, blob.encoding));
    const sha = id.tostrS();

    return {
        sha,
        url: `/repos/${owner}/${repo}/git/blobs/${sha}`,
    };
}

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): Router {
    const router: Router = Router();

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    router.post("/repos/:owner/:repo/git/blobs", (request, response, next) => {
        const blobP = createBlob(
            repoManager,
            request.params.owner,
            request.params.repo,
            request.body as ICreateBlobParams);
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
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    router.get("/repos/:owner/:repo/git/blobs/:sha", (request, response, next) => {
        const blobP = getBlob(
            repoManager,
            request.params.owner,
            request.params.repo,
            request.params.sha);
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
