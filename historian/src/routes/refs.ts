import { Response, Router } from "express";
import * as nconf from "nconf";
// import * as git from "nodegit";
import * as path from "path";
// import * as winston from "winston";
// import * as utils from "../utils";

export interface IRef {
    sha: string;
    url: string;
    object: {
        type: string;
        sha: string;
        url: string;
    };
}

export async function getRefs(gitDir: string): Promise<IRef[]> {
    return Promise.reject("");
}

export async function getRef(gitDir: string, id: string): Promise<IRef> {
    return Promise.reject("");
}

function handleResponse(resultP: Promise<any>, response: Response) {
    return resultP.then(
        (blob) => {
            response.status(200).json(blob);
        },
        (error) => {
            response.status(400).json(error);
        });
}

export function create(store: nconf.Provider): Router {
    const gitDir = path.resolve(store.get("storageDir"));

    const router: Router = Router();

    // https://developer.github.com/v3/git/refs/

    router.get("/repos/:repo/git/refs", (request, response, next) => {
        const resultP = getRefs(gitDir);
        handleResponse(resultP, response);
    });

    router.get("/repos/:repo/git/refs/:ref", (request, response, next) => {
        const resultP = getRef(gitDir, request.params.ref);
        handleResponse(resultP, response);
    });

    router.post("/repos/:repo/git/refs", (request, response, next) => {
        response.status(500).json();
    });

    router.patch("/repos/:repo/git/refs/:ref", (request, response, next) => {
        response.status(500).json();
    });

    router.delete("/repos/:repo/git/refs/:ref", (request, response, next) => {
        response.status(500).json();
    });

    return router;
}
