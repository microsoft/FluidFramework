/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import git from "nodegit";
import * as utils from "../../utils";

async function getContent(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    contentPath: string,
    ref: string): Promise<any> {
    const repository = await repoManager.open(owner, repo);
    const revObj = await git.Revparse.single(repository, `${ref}:${contentPath}`);

    // TODO switch on the type of object
    const blob = await repository.getBlob(revObj.id());
    return utils.blobToIBlob(blob, owner, repo);
}

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): Router {
    const router: Router = Router();

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    router.get("/repos/:owner/:repo/contents/*", (request, response, next) => {
        const resultP = getContent(
            repoManager,
            request.params.owner,
            request.params.repo,
            request.params[0],
            request.query.ref as string);
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
