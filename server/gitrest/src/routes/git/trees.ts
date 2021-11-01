/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateTreeParams, ITree, ITreeEntry } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import git from "nodegit";
import * as utils from "../../utils";

/**
 * Helper function to convert from a nodegit TreeEntry to our ITreeEntry
 */
function treeEntryToITreeEntry(entry: git.TreeEntry): ITreeEntry {
    return {
        mode: entry.filemode().toString(8),
        path: entry.path(),
        sha: entry.id().tostrS(),
        size: 0,
        type: utils.GitObjectType[entry.type()],
        url: "",
    };
}

async function getTreeInternal(repository: git.Repository, sha: string): Promise<ITree> {
    const tree = await repository.getTree(sha);

    const entries = tree.entries();
    const outputEntries: ITreeEntry[] = [];
    for (const entry of entries) {
        const output = treeEntryToITreeEntry(entry);
        outputEntries.push(output);
    }

    return {
        sha,
        tree: outputEntries,
        url: "",
    };
}

export async function createTree(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    tree: ICreateTreeParams): Promise<ITree> {
    const repository = await repoManager.open(owner, repo);
    // eslint-disable-next-line no-null/no-null
    const builder = await git.Treebuilder.create(repository, null);

    // build up the tree
    for (const node of tree.tree) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        builder.insert(node.path, git.Oid.fromString(node.sha), parseInt(node.mode, 8));
    }

    const id = await builder.write();
    return getTreeInternal(repository, id.tostrS());
}

async function getTree(repoManager: utils.RepositoryManager, owner: string, repo: string, sha: string): Promise<ITree> {
    const repository = await repoManager.open(owner, repo);
    return getTreeInternal(repository, sha);
}

export async function getTreeRecursive(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    sha: string): Promise<ITree> {
    const repository = await repoManager.open(owner, repo);
    const root = await repository.getTree(sha);

    const walker = root.walk(false);
    return new Promise<ITree>((resolve, reject) => {
        walker.on("end", (entries: git.TreeEntry[]) => {
            const tree: ITree = {
                sha,
                tree: entries.map((entry) => treeEntryToITreeEntry(entry)),
                url: "",
            };
            resolve(tree);
        });

        walker.on("error", (error) => {
            reject(error);
        });

        (walker as any).start();
    });
}

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): Router {
    const router: Router = Router();

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    router.post("/repos/:owner/:repo/git/trees", (request, response, next) => {
        const blobP = createTree(
            repoManager,
            request.params.owner,
            request.params.repo,
            request.body as ICreateTreeParams);
        return blobP.then(
            (blob) => {
                response.status(201).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    router.get("/repos/:owner/:repo/git/trees/:sha", (request, response, next) => {
        const blobP = request.query.recursive === "1"
            ? getTreeRecursive(repoManager, request.params.owner, request.params.repo, request.params.sha)
            : getTree(repoManager, request.params.owner, request.params.repo, request.params.sha);
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
