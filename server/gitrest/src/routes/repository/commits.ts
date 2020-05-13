/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import resources from "@microsoft/fluid-gitresources";
import { Router } from "express";
import nconf from "nconf";
import git from "nodegit";
import utils from "../../utils";

export async function getCommits(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    ref: string,
    count: number): Promise<resources.ICommitDetails[]> {

    const repository = await repoManager.open(owner, repo);
    const walker = git.Revwalk.create(repository);

    // tslint:disable-next-line:no-bitwise
    walker.sorting(git.Revwalk.SORT.TOPOLOGICAL | git.Revwalk.SORT.TIME);

    // Lookup the commits specified from the given revision
    const revObj = await git.Revparse.single(repository, ref);
    walker.push(revObj.id());
    const commits = await walker.getCommits(count);

    const detailedCommits = commits.map(async (rawCommit) => {
        const gitCommit = await utils.commitToICommit(rawCommit);
        return {
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
        } as resources.ICommitDetails;
    });

    return await Promise.all(detailedCommits);
}

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): Router {
    const router: Router = Router();

    // https://developer.github.com/v3/repos/commits/
    // sha
    // path
    // author
    // since
    // until
    router.get("/repos/:owner/:repo/commits", (request, response, next) => {
        const resultP = getCommits(
            repoManager,
            request.params.owner,
            request.params.repo,
            request.query.sha,
            request.query.count);
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
