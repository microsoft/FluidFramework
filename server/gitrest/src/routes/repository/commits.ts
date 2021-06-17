/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as resources from "@fluidframework/gitresources";
import { IGetRefParamsExternal } from "@fluidframework/server-services-client";
import { Router } from "express";
import nconf from "nconf";
import git from "nodegit";
import * as winston from "winston";
import { IExternalStorageManager } from "../../externalStorageManager";
import * as utils from "../../utils";

export async function getCommits(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    ref: string,
    count: number,
    readParams: IGetRefParamsExternal | undefined,
    externalStorageManager: IExternalStorageManager): Promise<resources.ICommitDetails[]> {
    const repository = await repoManager.open(owner, repo);
    try {
        const walker = git.Revwalk.create(repository);

        // eslint-disable-next-line no-bitwise
        walker.sorting(git.Revwalk.SORT.TOPOLOGICAL | git.Revwalk.SORT.TIME);

        // Lookup the commits specified from the given revision
        const revObj = await git.Revparse.single(repository, ref);
        walker.push(revObj.id());
        const commits = await walker.getCommits(count);

        const detailedCommits = commits.map(async (rawCommit) => {
            const gitCommit = await utils.commitToICommit(rawCommit);
            const result: resources.ICommitDetails =
            {
                commit: {
                    author: gitCommit.author,
                    committer: gitCommit.committer,
                    message: gitCommit.message,
                    tree: gitCommit.tree,
                    url: gitCommit.url,
                },
                parents: gitCommit.parents,
                sha: gitCommit.sha,
                url: "",

            };
            return result;
        });

        return Promise.all(detailedCommits);
    } catch (err) {
        winston.info(`getCommits error: ${err}`);
        if (readParams?.config?.enabled) {
            try {
                const result = await externalStorageManager.read(repo, ref);
                if (!result) {
                    return Promise.reject(err);
                }
                return getCommits(repoManager, owner, repo, ref, count, readParams, externalStorageManager);
            } catch (bridgeError) {
                // If file does not exist or error trying to look up commit, return the original error.
                winston.error(`BridgeError: ${bridgeError}`);
                return Promise.reject(err);
            }
        }
        return Promise.reject(err);
    }
}

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager,
    externalStorageManager: IExternalStorageManager): Router {
    const router: Router = Router();

    // https://developer.github.com/v3/repos/commits/
    // sha
    // path
    // author
    // since
    // until
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    router.get("/repos/:owner/:repo/commits", (request, response, next) => {
        const resultP = getCommits(
            repoManager,
            request.params.owner,
            request.params.repo,
            request.query.sha as string,
            Number(request.query.count as string),
            utils.getReadParams(request.query?.config),
            externalStorageManager);
        return resultP.then(
            (result) => {
                response.status(200).json(result);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}
