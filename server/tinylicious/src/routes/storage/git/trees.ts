/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateTreeParams, ITree, ITreeEntry } from "@fluidframework/gitresources";
import { Router } from "express";
import * as git from "isomorphic-git";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function createTree(
        tenantId: string,
        authorization: string,
        params: ICreateTreeParams,
    ): Promise<ITree> {
        const entries: git.TreeEntry[] = params.tree.map((tree) => {
            const entry: git.TreeEntry = {
                mode: tree.mode,
                oid: tree.sha,
                path: tree.path,
                type: tree.type,
            };

            return entry;
        });

        const treeDescription: git.TreeDescription = { entries };
        const sha = await git.writeObject({
            dir: utils.getGitDir(store, tenantId),
            type: "tree",
            object: treeDescription,
        });

        return getTree(tenantId, authorization, sha, false, true);
    }

    async function getTree(
        tenantId: string,
        authorization: string,
        sha: string,
        recursive: boolean,
        useCache: boolean,
    ): Promise<ITree> {
        let returnEntries;

        if (recursive) {
            returnEntries = await git.walkBeta2({
                dir: utils.getGitDir(store, tenantId),
                map: (async (path, [head]) => {
                    if (path === ".") {
                        return;
                    }

                    return {
                        path,
                        mode: (await head.mode()).toString(8),
                        sha: await head.oid(),
                        size: 0,
                        type: await head.type(),
                        url: "",
                    };
                }) as any,
                trees: [git.TREE({ ref: sha } as any)],
            });
        } else {
            const treeObject = await git.readObject({ dir: utils.getGitDir(store, tenantId), oid: sha });
            const description = treeObject.object as git.TreeDescription;

            returnEntries = description.entries.map((tree) => {
                const returnEntry: ITreeEntry = {
                    path: tree.path,
                    mode: tree.mode,
                    sha: tree.oid,
                    size: 0,
                    type: tree.type,
                    url: "",
                };

                return returnEntry;
            });
        }

        return {
            sha,
            tree: returnEntries,
            url: "",
        };
    }

    router.post(
        "/repos/:ignored?/:tenantId/git/trees",
        (request, response) => {
            const treeP = createTree(request.params.tenantId, request.get("Authorization"), request.body);
            utils.handleResponse(
                treeP,
                response,
                false,
                201);
        });

    router.get(
        "/repos/:ignored?/:tenantId/git/trees/:sha",
        (request, response) => {
            const useCache = !("disableCache" in request.query);
            const treeP = getTree(
                request.params.tenantId,
                request.get("Authorization"),
                request.params.sha,
                request.query.recursive === "1",
                useCache);
            utils.handleResponse(
                treeP,
                response,
                useCache);
        });

    return router;
}
