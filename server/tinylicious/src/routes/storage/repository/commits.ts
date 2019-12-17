/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommitDetails } from "@microsoft/fluid-gitresources";
import { Router } from "express";
import * as git from "isomorphic-git";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function getCommits(
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

    router.get(
        "/repos/:ignored?/:tenantId/commits",
        (request, response) => {
            const commitsP = getCommits(
                request.params.tenantId,
                request.get("Authorization"),
                request.query.sha,
                request.query.count);

            utils.handleResponse(
                commitsP,
                response,
                false);
        });

    return router;
}
