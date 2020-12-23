/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRef } from "@fluidframework/gitresources";
import {
    IGetRefParamsExternal,
    ICreateRefParamsExternal,
    IPatchRefParamsExternal } from "@fluidframework/server-services-client";
import { Response, Router } from "express";
import * as nconf from "nconf";
import git from "nodegit";
import * as winston from "winston";
import { IExternalStorageManager } from "../../externalStorageManager";
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

async function getRefs(repoManager: utils.RepositoryManager, owner: string, repo: string): Promise<IRef[]> {
    const repository = await repoManager.open(owner, repo);
    const refIds = await git.Reference.list(repository);
    const refsP = await Promise.all(refIds.map(async (refId) => git.Reference.lookup(repository, refId, undefined)));
    return refsP.map((ref) => refToIRef(ref));
}

async function getRef(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    refId: string,
    getRefParams: IGetRefParamsExternal,
    externalStorageManager: IExternalStorageManager): Promise<IRef> {
    const repository = await repoManager.open(owner, repo);
    try {
        const ref = await git.Reference.lookup(repository, refId, undefined);
        return refToIRef(ref);
    } catch (err) {
        // Lookup external storage if commit does not exist.
        const fileName = refId.substring(refId.lastIndexOf("/") + 1);
        // If file does not exist or error trying to look up commit, return the original error.
        if (getRefParams !== undefined && getRefParams.config?.enabled === true)
        {
            try {
                const result = await externalStorageManager.read(repo, fileName);
                if (!result) {
                    winston.error(`getRef error: ${err} repo: ${repo} ref: ${refId}`);
                    return Promise.reject(err);
                }
                return getRef(repoManager, owner, repo, refId, getRefParams, externalStorageManager);
            } catch (bridgeError) {
                winston.error(`Giving up on creating ref. BridgeError: ${bridgeError}`);
                return Promise.reject(err);
            }
        }
    }
}

async function createRef(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    createParams: ICreateRefParamsExternal,
    externalStorageManager: IExternalStorageManager,
): Promise<IRef> {
    const repository = await repoManager.open(owner, repo);
    const ref = await git.Reference.create(
        repository,
        createParams.ref,
        git.Oid.fromString(createParams.sha),
        0,
        "");

    if (createParams.config?.enabled) {
        try {
            await externalStorageManager.write(repo, createParams.ref, createParams.sha, false);
        } catch (e) {
            winston.error(`Error writing to file ${e}`);
        }
    }

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
    patchParams: IPatchRefParamsExternal,
    externalStorageManager: IExternalStorageManager,
): Promise<IRef> {
    const repository = await repoManager.open(owner, repo);
    const ref = await git.Reference.create(
        repository,
        refId,
        git.Oid.fromString(patchParams.sha),
        patchParams.force ? 1 : 0,
        "");

    if (patchParams.config?.enabled) {
        try {
            await externalStorageManager.write(repo, refId, patchParams.sha, true);
        } catch (e) {
            winston.error(`External storage write failed while trying to update file ${repo} / ${refId}`);
        }
    }

    return refToIRef(ref);
}

function handleResponse(resultP: Promise<any>, response: Response, successCode: number = 200) {
    resultP.then(
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
    return `refs/heads/${id}`;
}

function getReadParams(params): IGetRefParamsExternal {
    if (params !== undefined)
    {
        const getRefParams: IGetRefParamsExternal = JSON.parse(decodeURIComponent(params));
        return getRefParams;
    }
    return undefined;
}

export function create(
    store: nconf.Provider,
    repoManager: utils.RepositoryManager,
    externalStorageManager: IExternalStorageManager,
): Router {
    const router: Router = Router();

    // https://developer.github.com/v3/git/refs/

    router.get("/repos/:owner/:repo/git/refs", (request, response, next) => {
        const resultP = getRefs(repoManager, request.params.owner, request.params.repo);
        handleResponse(resultP, response);
    });

    router.get("/repos/:owner/:repo/git/refs/heads/:refId", (request, response, next) => {
        const resultP = getRef(
            repoManager,
            request.params.owner,
            request.params.repo,
            getRefId(request.params.refId),
            undefined,
            externalStorageManager);
        handleResponse(resultP, response);
    });

    router.get("/repos/:owner/:repo/git/refs/heads/:refId/:config", (request, response, next) => {
        const resultP = getRef(
            repoManager,
            request.params.owner,
            request.params.repo,
            getRefId(request.params.refId),
            getReadParams(request.params.config),
            externalStorageManager);
        handleResponse(resultP, response);
    });

    router.post("/repos/:owner/:repo/git/refs", (request, response, next) => {
        const resultP = createRef(
            repoManager,
            request.params.owner,
            request.params.repo,
            request.body as ICreateRefParamsExternal,
            externalStorageManager);
        handleResponse(resultP, response, 201);
    });

    router.patch("/repos/:owner/:repo/git/refs/*", (request, response, next) => {
        const resultP = patchRef(
            repoManager,
            request.params.owner,
            request.params.repo,
            getRefId(request.params[0]),
            request.body as IPatchRefParamsExternal,
            externalStorageManager);
        handleResponse(resultP, response);
    });

    router.delete("/repos/:owner/:repo/git/refs/*", (request, response, next) => {
        const deleteP = deleteRef(repoManager, request.params.owner, request.params.repo, getRefId(request.params[0]));
        deleteP.then(() => response.status(204).end(), (error) => response.status(400).json(error));
    });
    return router;
}
