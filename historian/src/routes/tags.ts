import { Router } from "express";
import * as nconf from "nconf";
import * as git from "nodegit";
import * as path from "path";
import * as utils from "../utils";

export interface ITagger {
    name: string;
    email: string;
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date: string;
}

export interface ICreateTagParams {
    tag: string;
    message: string;
    object: string;
    type: string;
    tagger: ITagger;
}

export interface ITag {
    tag: string;
    sha: string;
    url: string;
    message: string;
    tagger: ITagger;
    object: {
        type: string;
        sha: string;
        url: string;
    };
}

function tagToITag(tag: git.Tag): ITag {
    // TODO there's a bug in the nodegit d.ts file that thinks name and email and properties and not methods
    const tagger = tag.tagger() as any;
    const target = tag.target();

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

async function createTag(gitDir: string, repo: string, tag: ICreateTagParams): Promise<ITag> {
    const date = Date.parse(tag.tagger.date);
    if (isNaN(date)) {
        return Promise.reject("Invalid input");
    }

    const repository = await utils.openRepo(gitDir, repo);
    // TODO detect timezone information in date string rather than specifying UTC by default
    const signature = git.Signature.create(tag.tagger.name, tag.tagger.email, Math.floor(date), 0);
    const object = await git.Object.lookup(
        repository,
        git.Oid.fromString(tag.object),
        utils.GitObjectType[tag.type]);

    const tagOid = await git.Tag.annotationCreate(repository, tag.tag, object, signature, tag.message);
    return tagToITag(await git.Tag.lookup(repository, tagOid));
}

async function getTag(gitDir: string, repo: string, tagId: string): Promise<ITag> {
    const repository = await utils.openRepo(gitDir, repo);
    const tag = await git.Tag.lookup(repository, tagId);
    return tagToITag(tag);
}

export function create(store: nconf.Provider): Router {
    const gitDir = path.resolve(store.get("storageDir"));

    const router: Router = Router();

    // https://developer.github.com/v3/git/tags/

    router.post("/repos/:repo/git/tags", (request, response, next) => {
        const blobP = createTag(gitDir, request.params.repo, request.body as ICreateTagParams);
        return blobP.then(
            (blob) => {
                response.status(200).json(blob);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    router.get("/repos/:repo/git/tags/:sha", (request, response, next) => {
        const blobP = getTag(gitDir, request.params.repo, request.params.sha);
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
