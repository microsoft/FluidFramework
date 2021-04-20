/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateTagParams, ITag } from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import git from "nodegit";
import * as utils from "../../utils";

async function tagToITag(tag: git.Tag): Promise<ITag> {
    const tagger = tag.tagger() as any;
    const target = await tag.target();

    return {
        message: tag.message(),
        object: {
            sha: target.id().tostrS(),
            type: utils.GitObjectType[target.type()],
            url: "",
        },
        sha: tag.id().tostrS(),
        tag: tag.name(),
        tagger: {
            date: "",
            email: tagger.email(),
            name: tagger.name(),
        },
        url: "",
    };
}

async function createTag(
    repoManager: utils.RepositoryManager,
    owner: string,
    repo: string,
    tag: ICreateTagParams): Promise<ITag> {
    const date = Date.parse(tag.tagger.date);
    if (isNaN(date)) {
        // eslint-disable-next-line prefer-promise-reject-errors
        return Promise.reject("Invalid input");
    }

    const repository = await repoManager.open(owner, repo);
    const signature = git.Signature.create(tag.tagger.name, tag.tagger.email, Math.floor(date), 0);
    const object = await git.Object.lookup(
        repository,
        git.Oid.fromString(tag.object),
        utils.GitObjectType[tag.type]);

    const tagOid = await git.Tag.annotationCreate(repository, tag.tag, object, signature, tag.message);
    return tagToITag(await git.Tag.lookup(repository, tagOid));
}

async function getTag(repoManager: utils.RepositoryManager, owner: string, repo: string, tagId: string): Promise<ITag> {
    const repository = await repoManager.open(owner, repo);
    const tag = await git.Tag.lookup(repository, tagId);
    return tagToITag(tag);
}

export function create(store: nconf.Provider, repoManager: utils.RepositoryManager): Router {
    const router: Router = Router();

    // https://developer.github.com/v3/git/tags/

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    router.post("/repos/:owner/:repo/git/tags", (request, response, next) => {
        const blobP = createTag(
            repoManager,
            request.params.owner,
            request.params.repo,
            request.body as ICreateTagParams);

        return blobP.then(
            (blob) => {
                response.status(201).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    router.get("/repos/:owner/:repo/git/tags/*", (request, response, next) => {
        const blobP = getTag(repoManager, request.params.owner, request.params.repo, request.params[0]);
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
