import {
    IClient,
    IClientJoin,
    IDocumentMessage,
    IDocumentSystemMessage,
    ITokenClaims,
    IUser,
    MessageType,
    Robot } from "@prague/runtime-definitions";
import * as core from "@prague/services-core";
import { Router } from "express";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";

interface IOperation {
    op: string;
    path: string;
    value: string;
}

export function create(
    producer: core.IProducer,
    appTenants: core.IAlfredTenant[],
    tenantManager: core.ITenantManager,
    storage: core.IDocumentStorage): Router {

    const router: Router = Router();

    router.patch("/:tenantId?/:id", (request, response) => {
        const token = request.headers["access-token"] as string;
        if (token) {
            const tenantId = request.params.tenantId || appTenants[0].id;
            const documentId = request.params.id;
            const claims = jwt.decode(token) as ITokenClaims;
            if (!claims || claims.documentId !== documentId || claims.tenantId !== tenantId) {
                response.status(400).json( {error: "Invalid access token"} );
            } else {
                const tokenP = tenantManager.verifyToken(tenantId, token);
                const docP = storage.getDocument(tenantId, documentId);
                Promise.all([docP, tokenP]).then((data) => {
                    // Check document existence.
                    if (data[0]) {
                        const clientId = moniker.choose();

                        const reqOps = request.body as IOperation[];

                        const detail: IClient = {
                            permission: [],
                            type: Robot,
                        };
                        const clientDetail: IClientJoin = {
                            clientId,
                            detail,
                        };

                        // Send join message.
                        const joinMessage = craftSystemMessage(tenantId, documentId, clientDetail);
                        producer.send(joinMessage, tenantId, documentId);

                        let clSeqNum = 1;
                        for (const reqOp of reqOps) {
                            const op = craftOp(reqOp);
                            const opMessage = craftMessage(
                                tenantId,
                                documentId,
                                clientId,
                                JSON.stringify(op),
                                clSeqNum++);
                            producer.send(opMessage, tenantId, documentId);
                        }

                        // Send leave message.
                        const leaveMessage = craftSystemMessage(tenantId, documentId, clientId);
                        producer.send(leaveMessage, tenantId, documentId);

                        response.status(200).json();
                    } else {
                        response.status(400).json( {error: "Document not found"} );
                    }
                }, () => {
                    response.status(401).json();
                });
            }
        } else {
            response.status(400).json( {error: "Missing access token"} );
        }
    });

    return router;
}

function craftOp(reqOp: IOperation) {
    // Craft and send op
    const opContent = {
        key: reqOp.path,
        type: "set",
        value: {
            type: "Plain",
            value: reqOp.value,
        },
    };

    const op = {
        address: "root",
        contents: {
            clientSequenceNumber: 1,
            contents: opContent,
            referenceSequenceNumber: 1,
            type: "op",
        },
    };

    return op;
}

// Back-compat: Replicate the same info in content, metadata, and data.
function craftSystemMessage(
    tenantId: string,
    documentId: string,
    contents: IClientJoin | string): core.IRawOperationMessage {
        const type = (typeof contents === "string") ? MessageType.ClientLeave : MessageType.ClientJoin;
        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents,
            data: JSON.stringify(contents),
            metadata: {
                content: contents,
                split: false,
            },
            referenceSequenceNumber: -1,
            traces: [],
            type,
        };

        const user: IUser = {
            id: "test",
        };

        const message: core.IRawOperationMessage = {
            clientId: null,
            documentId,
            operation,
            tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user,
        };

        return message;
}

function craftMessage(
    tenantId: string,
    documentId: string,
    clientId: string,
    contents: string,
    clientSequenceNumber: number): core.IRawOperationMessage {
        const operation: IDocumentMessage = {
            clientSequenceNumber,
            contents,
            referenceSequenceNumber: -1,
            traces: [],
            type: MessageType.Operation,
        };

        const user: IUser = {
            id: "test",
        };

        const message: core.IRawOperationMessage = {
            clientId,
            documentId,
            operation,
            tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user,
        };

        return message;
}
