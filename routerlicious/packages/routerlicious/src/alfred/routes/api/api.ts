import {
    IClient,
    IClientJoin,
    IDocumentSystemMessage,
    IUser,
    MessageType,
    Robot } from "@prague/runtime-definitions";
import { Router } from "express";
import * as moniker from "moniker";
import * as core from "../../../core";
import * as utils from "../../../utils";
import { IAlfredTenant } from "../../tenant";

export function create(
    producer: utils.IProducer,
    appTenants: IAlfredTenant[]): Router {

    const router: Router = Router();

    router.post("/:tenantId?/:id", (request, response) => {
        const tenantId = request.params.tenantId || appTenants[0].id;
        const documentId = request.params.id;
        const clientId = moniker.choose();

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

        // Send leave message.
        const leaveMessage = craftSystemMessage(tenantId, documentId, clientId);
        producer.send(leaveMessage, tenantId, documentId);

        response.status(200).json( {status: "Sent client join and leave"} );
    });

    return router;
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
