import {
    IClient,
    IClientJoin,
    ITokenClaims,
} from "@prague/container-definitions";
import * as core from "@prague/services-core";
import { Request, Response, Router } from "express";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";
import {
    craftClientJoinMessage,
    craftClientLeaveMessage,
    craftMapSet,
    craftOpMessage,
    IMapSetOperation } from "./restHelper";

const Robot = "robot";
export function create(
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
            const tenantId = request.params.tenantId;
            const documentId = request.params.id;
            const clientId = moniker.choose();
            sendJoin(tenantId, documentId, clientId, producer);
            sendOp(request, tenantId, documentId, clientId, producer, opBuilder);
            sendLeave(tenantId, documentId, clientId, producer);
            response.status(200).json();
        },
        (error) => response.status(400).end(error.toString()));
    }

    router.patch("/:tenantId/:id/root", async (request, response) => {
        const validP = verifyRequest(request, tenantManager, storage);
        returnResponse(validP, request, response, mapSetBuilder);
    });

    router.post("/:tenantId/:id/blobs", async (request, response) => {
        // upload blob here
        response.status(200).json();
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
        type: Robot,
        user: {id: "Rest-Client"},
    };
    const clientDetail: IClientJoin = {
        clientId,
        detail,
    };

    const joinMessage = craftClientJoinMessage(tenantId, documentId, clientDetail);
    producer.send(joinMessage, tenantId, documentId);
}

function sendLeave(tenantId: string, documentId: string, clientId: string, producer: core.IProducer) {
    const leaveMessage = craftClientLeaveMessage(tenantId, documentId, clientId);
    producer.send(leaveMessage, tenantId, documentId);
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
        producer.send(opMessage, tenantId, documentId);
    }
}

async function verifyRequest(
    request: Request,
    tenantManager: core.ITenantManager,
    storage: core.IDocumentStorage) {
        return Promise.all([verifyToken(request, tenantManager), checkDocumentExistence(request, storage)]);
}

async function verifyToken(request: Request, tenantManager: core.ITenantManager): Promise<void> {
    const token = request.headers["access-token"] as string;
    if (!token) {
        return Promise.reject("Missing access token");
    }
    const tenantId = request.params.tenantId;
    const documentId = request.params.id;
    const claims = jwt.decode(token) as ITokenClaims;
    if (!claims || claims.documentId !== documentId || claims.tenantId !== tenantId) {
        return Promise.reject("Invalid access token");
    }
    return tenantManager.verifyToken(tenantId, token);
}

async function checkDocumentExistence(request: Request, storage: core.IDocumentStorage): Promise<any> {
    const tenantId = request.params.tenantId;
    const documentId = request.params.id;
    if (!tenantId || !documentId) {
        return Promise.reject("Invalid tenant or document id");
    }
    return storage.getDocument(tenantId, documentId);
}
