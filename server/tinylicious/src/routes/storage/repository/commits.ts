/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommitDetails } from "@fluidframework/gitresources";
import { Router } from "express";
import * as git from "isomorphic-git";
import nconf from "nconf";
import { queryParamToNumber, queryParamToString } from "../../../utils";
import * as utils from "../utils";

export async function getCommits(
    store: nconf.Provider,
    tenantId: string,
    authorization: string,
    sha: string,
    count: number,
): Promise<ICommitDetails[]> {
    const descriptions = await git.log({
        depth: count,
        dir: utils.getGitDir(store, tenantId),
        ref: sha,
    });

    return descriptions.map((description) => {
        return {
            url: "",
            sha: description.oid,
            commit: {
                url: "",
                author: {
                    name: description.author.name,
                    email: description.author.email,
                    date: new Date(description.author.timestamp * 1000).toISOString(),
                },
                committer: {
                    name: description.committer.name,
                    email: description.committer.email,
                    date: new Date(description.committer.timestamp * 1000).toISOString(),
                },
                message: description.message,
                tree: {
                    sha: description.tree,
                    url: "",
                },
            },
            parents: description.parent.map((parent) => ({ sha: parent, url: "" })),
        };
    });
}

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    router.get(
        "/repos/:ignored?/:tenantId/commits",
        (request, response) => {
            const commitsP = getCommits(
                store,
                request.params.tenantId,
                request.get("Authorization"),
                queryParamToString(request.query.sha),
                queryParamToNumber(request.query.count));

            utils.handleResponse(
                commitsP,
                response,
                false);
        });

    return router;
}
