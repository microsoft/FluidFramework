import { Response, Router } from "express";
import * as nconf from "nconf";
import * as git from "nodegit";
import * as path from "path";
import { ICreateRefParams, IPatchRefParams, IRef } from "../../resources";
import * as utils from "../../utils";

function refToIRef(ref: git.Reference): IRef {
    return {
        object: {
            sha: ref.target().tostrS(),
            type: "",
            url: "",
        },
        ref: ref.name(),
        url: "",
    };
}

async function getRefs(gitDir: string, repo: string): Promise<IRef[]> {
    const repository = await utils.openRepo(gitDir, repo);
    const refIds = await git.Reference.list(repository);
    const refsP = await Promise.all(refIds.map((refId) => git.Reference.lookup(repository, refId, undefined)));
    return refsP.map((ref) => refToIRef(ref));
}

async function getRef(gitDir: string, repo: string, refId: string): Promise<IRef> {
    const repository = await utils.openRepo(gitDir, repo);
    const ref = await git.Reference.lookup(repository, refId, undefined);
    return refToIRef(ref);
}

async function createRef(gitDir: string, repo: string, createParams: ICreateRefParams): Promise<IRef> {
    const repository = await utils.openRepo(gitDir, repo);
    const ref = await git.Reference.create(
        repository,
        createParams.ref,
        git.Oid.fromString(createParams.sha),
        0,
        "");
    return refToIRef(ref);
}

async function deleteRef(gitDir: string, repo: string, refId: string): Promise<void> {
    const repository = await utils.openRepo(gitDir, repo);
    const code = git.Reference.remove(repository, refId);
    return code === 0 ? Promise.resolve() : Promise.reject(code);
}

async function patchRef(gitDir: string, repo: string, refId: string, patchParams: IPatchRefParams): Promise<IRef> {
    const repository = await utils.openRepo(gitDir, repo);
    const ref = await git.Reference.create(
        repository,
        refId,
        git.Oid.fromString(patchParams.sha),
        patchParams.force ? 1 : 0,
        "");
    return refToIRef(ref);
}

function handleResponse(resultP: Promise<any>, response: Response, successCode: number = 200) {
    return resultP.then(
        (blob) => {
            response.status(successCode).json(blob);
        },
        (error) => {
            response.status(400).json(error);
        });
}

/**
 * Simple method to convert from a path id to the git reference ID
 */
function getRefId(id): string {
    return `refs/${id}`;
}

export function create(store: nconf.Provider): Router {
    const gitDir = path.resolve(store.get("storageDir"));

    const router: Router = Router();

    // https://developer.github.com/v3/git/refs/

    router.get("/repos/:repo/git/refs", (request, response, next) => {
        const resultP = getRefs(gitDir, request.params.repo);
        handleResponse(resultP, response);
    });

    router.get("/repos/:repo/git/refs/*", (request, response, next) => {
        const resultP = getRef(gitDir, request.params.repo, getRefId(request.params[0]));
        handleResponse(resultP, response);
    });

    router.post("/repos/:repo/git/refs", (request, response, next) => {
        const resultP = createRef(gitDir, request.params.repo, request.body as ICreateRefParams);
        handleResponse(resultP, response, 201);
    });

    router.patch("/repos/:repo/git/refs/*", (request, response, next) => {
        // TODO per the below I think I need to validate the update can be a FF
        // Indicates whether to force the update or to make sure the update is a fast-forward update.
        // Leaving this out or setting it to false will make sure you're not overwriting work. Default: false
        const resultP = patchRef(
            gitDir,
            request.params.repo,
            getRefId(request.params[0]),
            request.body as IPatchRefParams);
        handleResponse(resultP, response);
    });

    router.delete("/repos/:repo/git/refs/*", (request, response, next) => {
        const deleteP = deleteRef(gitDir, request.params.repo, getRefId(request.params[0]));
        deleteP.then(() => response.status(204).end(), (error) => response.status(400).json(error));
    });

    return router;
}
