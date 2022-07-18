/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import * as git from "@fluidframework/gitresources";
import { IClient, IClientJoin, ScopeType } from "@fluidframework/protocol-definitions";
import { validateTokenClaimsExpiration } from "@fluidframework/server-services-client";
import * as core from "@fluidframework/server-services-core";
import {
    validateTokenClaims,
    throttle,
    IThrottleMiddlewareOptions,
    getParam,
} from "@fluidframework/server-services-utils";
import { validateRequestParams, handleResponse } from "@fluidframework/server-services";
import { Request, Router } from "express";
import sillyname from "sillyname";
import { Provider } from "nconf";
import requestAPI from "request";
import winston from "winston";
import { Constants } from "../../../utils";
import {
    craftClientJoinMessage,
    craftClientLeaveMessage,
    craftMapSet,
    craftOpMessage,
    IBlobData,
    IMapSetOperation,
} from "./restHelper";

export function create(
    config: Provider,
    producer: core.IProducer,
    tenantManager: core.ITenantManager,
    storage: core.IDocumentStorage,
    throttler: core.IThrottler): Router {
    const router: Router = Router();

    const commonThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
        throttleIdPrefix: (req) => getParam(req.params, "tenantId"),
        throttleIdSuffix: Constants.alfredRestThrottleIdSuffix,
    };

    function handlePatchRootSuccess(
        request: Request,
        opBuilder: (request: Request) => any[],
    ) {
        const tenantId = getParam(request.params, "tenantId");
        const documentId = getParam(request.params, "id");
        const clientId = (sillyname() as string).toLowerCase().split(" ").join("-");
        sendJoin(tenantId, documentId, clientId, producer);
        sendOp(request, tenantId, documentId, clientId, producer, opBuilder);
        sendLeave(tenantId, documentId, clientId, producer);
    }

    router.get("/ping", throttle(throttler, winston, {
        ...commonThrottleOptions,
        throttleIdPrefix: "ping",
    }), async (request, response) => {
        response.sendStatus(200);
    });

    router.patch(
        "/:tenantId/:id/root",
        validateRequestParams("tenantId", "id"),
        throttle(throttler, winston, commonThrottleOptions),
        async (request, response) => {
            const maxTokenLifetimeSec = config.get("auth:maxTokenLifetimeSec") as number;
            const isTokenExpiryEnabled = config.get("auth:enableTokenExpiration") as boolean;
            const validP = verifyRequest(request, tenantManager, storage, maxTokenLifetimeSec, isTokenExpiryEnabled);
            handleResponse(
                validP.then(() => undefined),
                response,
                undefined,
                undefined,
                200,
                () => handlePatchRootSuccess(request, mapSetBuilder));
        },
    );

    router.post(
        "/:tenantId/:id/blobs",
        validateRequestParams("tenantId", "id"),
        throttle(throttler, winston, commonThrottleOptions),
        async (request, response) => {
            const tenantId = getParam(request.params, "tenantId");
            const blobData = request.body as IBlobData;
            // TODO: why is this contacting external blob storage?
            const externalHistorianUrl = config.get("worker:blobStorageUrl") as string;
            const requestToken = fromUtf8ToBase64(tenantId);
            const uri = `${externalHistorianUrl}/repos/${tenantId}/git/blobs?token=${requestToken}`;
            const requestBody: git.ICreateBlobParams = {
                content: blobData.content,
                encoding: "base64",
            };
            uploadBlob(uri, requestBody).then((data: git.ICreateBlobResponse) => {
                response.status(200).json(data);
            }, (err) => {
                response.status(400).end(err.toString());
            });
        },
    );

    return router;
}

function mapSetBuilder(request: Request): any[] {
    const reqOps = request.body as IMapSetOperation[];
    const ops = [];
    for (const reqOp of reqOps) {
        ops.push(craftMapSet(reqOp));
    }

    return ops;
}

function sendJoin(tenantId: string, documentId: string, clientId: string, producer: core.IProducer) {
    const detail: IClient = {
        mode: "write",
        permission: [],
        scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
        details: {
            capabilities: { interactive: false },
        },
        user: { id: "Rest-Client" },
    };
    const clientDetail: IClientJoin = {
        clientId,
        detail,
    };

    const joinMessage = craftClientJoinMessage(tenantId, documentId, clientDetail);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    producer.send([joinMessage], tenantId, documentId);
}

function sendLeave(tenantId: string, documentId: string, clientId: string, producer: core.IProducer) {
    const leaveMessage = craftClientLeaveMessage(tenantId, documentId, clientId);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    producer.send([leaveMessage], tenantId, documentId);
}

function sendOp(
    request: Request,
    tenantId: string,
    documentId: string,
    clientId: string,
    producer: core.IProducer,
    opBuilder: (request: Request) => any[]) {
    const opContents = opBuilder(request);
    let clientSequenceNumber = 1;
    for (const content of opContents) {
        const opMessage = craftOpMessage(
            tenantId,
            documentId,
            clientId,
            JSON.stringify(content),
            clientSequenceNumber++);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        producer.send([opMessage], tenantId, documentId);
    }
}

const verifyRequest = async (
    request: Request,
    tenantManager: core.ITenantManager,
    storage: core.IDocumentStorage,
    maxTokenLifetimeSec: number,
    // eslint-disable-next-line max-len
    isTokenExpiryEnabled: boolean) => Promise.all([verifyToken(request, tenantManager, maxTokenLifetimeSec, isTokenExpiryEnabled), checkDocumentExistence(request, storage)]);

// eslint-disable-next-line max-len
async function verifyToken(request: Request, tenantManager: core.ITenantManager, maxTokenLifetimeSec: number, isTokenExpiryEnabled: boolean): Promise<void> {
    const token = request.headers["access-token"] as string;
    if (!token) {
        return Promise.reject(new Error("Missing access token"));
    }
    const tenantId = getParam(request.params, "tenantId");
    const documentId = getParam(request.params, "id");
    const claims = validateTokenClaims(token, documentId, tenantId);
    if (isTokenExpiryEnabled) {
        validateTokenClaimsExpiration(claims, maxTokenLifetimeSec);
    }
    return tenantManager.verifyToken(claims.tenantId, token);
}

async function checkDocumentExistence(request: Request, storage: core.IDocumentStorage): Promise<any> {
    const tenantId = getParam(request.params, "tenantId");
    const documentId = getParam(request.params, "id");
    if (!tenantId || !documentId) {
        return Promise.reject(new Error("Invalid tenant or document id"));
    }
    const document = await storage.getDocument(tenantId, documentId);
    if (!document || document.scheduledDeletionTime) {
        return Promise.reject(new Error("Cannot access document marked for deletion"));
    }
}

const uploadBlob = async (uri: string, blobData: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> =>
    new Promise<git.ICreateBlobResponse>((resolve, reject) => {
        requestAPI(
            {
                body: blobData,
                headers: {
                    "Content-Type": "application/json",
                },
                json: true,
                method: "POST",
                uri,
            },
            (err, resp, body) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(body as git.ICreateBlobResponse);
                }
            });
    });
