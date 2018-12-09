import {
    IClient,
    IClientJoin,
    IDocumentMessage,
    IDocumentSystemMessage,
    IUser,
    MessageType,
    Robot } from "@prague/runtime-definitions";
import { Router } from "express";
import * as moniker from "moniker";
import * as core from "../../../core";
import * as utils from "../../../utils";
import { IAlfredTenant } from "../../tenant";

interface IOperation {
    op: string;
    path: string;
    value: string;
}

export function create(
    producer: utils.IProducer,
    appTenants: IAlfredTenant[]): Router {

    const router: Router = Router();

    router.post("/:tenantId?/:id", (request, response) => {
        const tenantId = request.params.tenantId || appTenants[0].id;
        const documentId = request.params.id;
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
            const opMessage = craftMessage(tenantId, documentId, clientId, JSON.stringify(op), clSeqNum++);
            producer.send(opMessage, tenantId, documentId);
        }

        // Send leave message.
        const leaveMessage = craftSystemMessage(tenantId, documentId, clientId);
        producer.send(leaveMessage, tenantId, documentId);

        response.status(200).json( {status: "Sent client join and leave"} );
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
