/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-use-before-define */

import { fromUtf8ToBase64 } from "@microsoft/fluid-core-utils";
import * as git from "@microsoft/fluid-gitresources";
import { IClient, IClientJoin, ITokenClaims, ScopeType } from "@microsoft/fluid-protocol-definitions";
import * as core from "@microsoft/fluid-server-services-core";
import { Request, Response, Router } from "express";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";
import { Provider } from "nconf";
import * as requestAPI from "request";
import { getParam } from "../../utils";
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
    storage: core.IDocumentStorage): Router {

    const router: Router = Router();

    function returnResponse<T>(
        resultP: Promise<T>,
        request: Request,
        response: Response,
        opBuilder: (request: Request) => any[]) {
        resultP.then(() => {
            const tenantId = getParam(request.params, "tenantId");
            const documentId = getParam(request.params, "id");
            const clientId = moniker.choose();
            sendJoin(tenantId, documentId, clientId, producer);
            sendOp(request, tenantId, documentId, clientId, producer, opBuilder);
            sendLeave(tenantId, documentId, clientId, producer);
            response.status(200).json();
        }, (error) => response.status(400).end(error.toString()));
    }

    router.patch("/:tenantId/:id/root", async (request, response) => {
        const validP = verifyRequest(request, tenantManager, storage);
        returnResponse(validP, request, response, mapSetBuilder);
    });

    router.post("/:tenantId/:id/blobs", async (request, response) => {
        const tenantId = getParam(request.params, "tenantId");
        const blobData = request.body as IBlobData;
        const historian = config.get("worker:blobStorageUrl") as string;
        const requestToken = fromUtf8ToBase64(tenantId);
        const uri = `${historian}/repos/${tenantId}/git/blobs?token=${requestToken}`;
        const requestBody: git.ICreateBlobParams = {
            content: blobData.content,
            encoding: "base64",
        };
        uploadBlob(uri, requestBody).then((data: git.ICreateBlobResponse) => {
            response.status(200).json(data);
        }, (err) => {
            response.status(400).end(err.toString());
        });
    });

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
    // eslint-disable-next-line max-len
    storage: core.IDocumentStorage) => Promise.all([verifyToken(request, tenantManager), checkDocumentExistence(request, storage)]);

async function verifyToken(request: Request, tenantManager: core.ITenantManager): Promise<void> {
    const token = request.headers["access-token"] as string;
    if (!token) {
        return Promise.reject("Missing access token");
    }
    const tenantId = getParam(request.params, "tenantId");
    const documentId = getParam(request.params, "id");
    const claims = jwt.decode(token) as ITokenClaims;
    if (!claims || claims.documentId !== documentId || claims.tenantId !== tenantId) {
        return Promise.reject("Invalid access token");
    }
    return tenantManager.verifyToken(tenantId, token);
}

async function checkDocumentExistence(request: Request, storage: core.IDocumentStorage): Promise<any> {
    const tenantId = getParam(request.params, "tenantId");
    const documentId = getParam(request.params, "id");
    if (!tenantId || !documentId) {
        return Promise.reject("Invalid tenant or document id");
    }
    return storage.getDocument(tenantId, documentId);
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
