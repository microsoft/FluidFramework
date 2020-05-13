/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateRefParams, IPatchRefParams, IRef } from "@microsoft/fluid-gitresources";
import { Response, Router } from "express";
import nconf from "nconf";
import git from "nodegit";
import utils from "../../utils";

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

async function getRefs(repoManager: utils.RepositoryManager, owner: string, repo: string): Promise<IRef[]> {
    const repository = await repoManager.open(owner, repo);
    const refIds = await git.Reference.list(repository);
    const refsP = await Promise.all(refIds.map((refId) => git.Reference.lookup(repository, refId, undefined)));
    return refsP.map((ref) => refToIRef(ref));
}

async function getRef(repoManager: utils.RepositoryManager, owner: string, repo: string, refId: string): Promise<IRef> {
    const repository = await repoManager.open(owner, repo);
    const ref = await git.Reference.lookup(repository, refId, undefined);
    return refToIRef(ref);
}

async function createRef(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    createParams: ICreateRefParams): Promise<IRef> {

    const repository = await repoManager.open(owner, repo);
    const ref = await git.Reference.create(
        repository,
        createParams.ref,
        git.Oid.fromString(createParams.sha),
        0,
        "");
    return refToIRef(ref);
}

async function deleteRef(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    refId: string): Promise<void> {

    const repository = await repoManager.open(owner, repo);
    const code = git.Reference.remove(repository, refId);
    return code === 0 ? Promise.resolve() : Promise.reject(code);
}

async function patchRef(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    refId: string,
    patchParams: IPatchRefParams): Promise<IRef> {

    const repository = await repoManager.open(owner, repo);
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

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): Router {
    const router: Router = Router();

    // https://developer.github.com/v3/git/refs/

    router.get("/repos/:owner/:repo/git/refs", (request, response, next) => {
        const resultP = getRefs(repoManager, request.params.owner, request.params.repo);
        handleResponse(resultP, response);
    });

    router.get("/repos/:owner/:repo/git/refs/*", (request, response, next) => {
        const resultP = getRef(repoManager, request.params.owner, request.params.repo, getRefId(request.params[0]));
        handleResponse(resultP, response);
    });

    router.post("/repos/:owner/:repo/git/refs", (request, response, next) => {
        const resultP = createRef(
            repoManager,
            request.params.owner,
            request.params.repo,
            request.body as ICreateRefParams);
        handleResponse(resultP, response, 201);
    });

    router.patch("/repos/:owner/:repo/git/refs/*", (request, response, next) => {
        const resultP = patchRef(
            repoManager,
            request.params.owner,
            request.params.repo,
            getRefId(request.params[0]),
            request.body as IPatchRefParams);
        handleResponse(resultP, response);
    });

    router.delete("/repos/:owner/:repo/git/refs/*", (request, response, next) => {
        const deleteP = deleteRef(repoManager, request.params.owner, request.params.repo, getRefId(request.params[0]));
        deleteP.then(() => response.status(204).end(), (error) => response.status(400).json(error));
    });

    return router;
}
