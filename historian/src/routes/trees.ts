import { Router } from "express";
import * as nconf from "nconf";
import * as git from "nodegit";
import * as path from "path";
import * as utils from "../utils";

export interface ICreateTreeEntry {
    path: string;
    mode: string;
    type: string;
    sha: string;
}

export interface ICreateTreeParams {
    base_tree: string;
    tree: ICreateTreeEntry[];
}

export interface ITreeEntry {
    path: string;
    mode: string;
    type: string;
    size: number;
    sha: string;
    url: string;
}

export interface ITree {
    sha: string;
    url: string;
    tree: ITreeEntry[];
}

async function createTree(gitDir: string, repo: string, tree: ICreateTreeParams): Promise<ITree> {
    const repository = await utils.openRepo(gitDir, repo);
    // TODO if base_tree exists look it up here and assume everything else is an insert
    const builder = await git.Treebuilder.create(repository, null);

    // build up the tree
    const entriesP = [];
    for (const node of tree.tree) {
        // TODO support content as well
        const entryP = builder.insert(node.path, git.Oid.fromString(node.sha), parseInt(node.mode, 8));
        entriesP.push(entryP);
    }
    await Promise.all(entriesP);

    const id = builder.write();
    return getTreeInternal(repository, id.tostrS());
}

async function getTree(gitDir: string, repo: string, sha: string): Promise<ITree> {
    const repository = await utils.openRepo(gitDir, repo);
    return getTreeInternal(repository, sha);
}

async function getTreeInternal(repository: git.Repository, sha: string): Promise<ITree> {
    const tree = await repository.getTree(sha);

    const entries = tree.entries();
    const outputEntries: ITreeEntry[] = [];
    for (const entry of entries) {
        const output: ITreeEntry = {
            mode: entry.filemode().toString(8),
            path: entry.path(),
            sha: entry.id().tostrS(),
            size: 0, // TODO
            type: utils.GitObjectType[entry.type()],
            url: "", // TODO
        };
        outputEntries.push(output);
    }

    return {
        sha,
        tree: outputEntries,
        url: "",
    };
}

export function create(store: nconf.Provider): Router {
    const gitDir = path.resolve(store.get("storageDir"));

    const router: Router = Router();

    router.post("/repos/:repo/git/trees", (request, response, next) => {
        // TODO check for recursive /repos/:owner/:repo/git/trees/:sha?recursive=1
        const blobP = createTree(gitDir, request.params.repo, request.body as ICreateTreeParams);
        return blobP.then(
            (blob) => {
                response.status(200).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    router.get("/repos/:repo/git/trees/:sha", (request, response, next) => {
        const blobP = getTree(gitDir, request.params.repo, request.params.sha);
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
