/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateRefParams, IPatchRefParams, IRef } from "@microsoft/fluid-gitresources";
import { Router } from "express";
import * as git from "isomorphic-git";
import * as nconf from "nconf";
import * as utils from "../utils";

function refToIRef(ref: string, sha: string): IRef {
    return {
        object: {
            sha,
            type: "",
            url: "",
        },
        ref,
        url: "",
    };
}

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    async function getRefs(tenantId: string, authorization: string): Promise<IRef[]> {
        throw new Error("Not implemented");
    }

    async function getRef(tenantId: string, authorization: string, ref: string): Promise<IRef> {
        const resolved = await git.resolveRef({
            dir: utils.getGitDir(store, tenantId),
            ref,
        });

        return refToIRef(ref, resolved);
    }

    async function createRef(tenantId: string, authorization: string, params: ICreateRefParams): Promise<IRef> {
        await git.writeRef({
            dir: utils.getGitDir(store, tenantId),
            ref: params.ref,
            value: params.sha,
        });

        return refToIRef(params.ref, params.sha);
    }

    async function updateRef(
        tenantId: string,
        authorization: string,
        ref: string,
        params: IPatchRefParams,
    ): Promise<IRef> {
        await git.writeRef({
            dir: utils.getGitDir(store, tenantId),
            ref,
            value: params.sha,
        });

        return refToIRef(ref, params.sha);
    }

    async function deleteRef(
        tenantId: string,
        authorization: string,
        ref: string,
    ): Promise<void> {
        throw new Error("Not implemented");
    }

    router.get(
        "/repos/:ignored?/:tenantId/git/refs",
        (request, response) => {
            const refsP = getRefs(request.params.tenantId, request.get("Authorization"));
            utils.handleResponse(
                refsP,
                response,
                false);
        });

    router.get(
        "/repos/:ignored?/:tenantId/git/refs/*",
        (request, response) => {
            const refP = getRef(request.params.tenantId, request.get("Authorization"), request.params[0]);
            utils.handleResponse(
                refP,
                response,
                false);
        });

    router.post(
        "/repos/:ignored?/:tenantId/git/refs",
        (request, response) => {
            const refP = createRef(request.params.tenantId, request.get("Authorization"), request.body);
            utils.handleResponse(
                refP,
                response,
                false,
                201);
        });

    router.patch(
        "/repos/:ignored?/:tenantId/git/refs/*",
        (request, response) => {
            const refP = updateRef(
                request.params.tenantId,
                request.get("Authorization"),
                request.params[0],
                request.body);
            utils.handleResponse(
                refP,
                response,
                false);
        });

    router.delete(
        "/repos/:ignored?/:tenantId/git/refs/*",
        (request, response) => {
            const refP = deleteRef(request.params.tenantId, request.get("Authorization"), request.params[0]);
            utils.handleResponse(
                refP,
                response,
                false,
                204);
        });

    return router;
}
