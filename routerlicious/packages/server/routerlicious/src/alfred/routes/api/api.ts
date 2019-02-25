import {
    IClient,
    IClientJoin,
    IDocumentMessage,
    IDocumentSystemMessage,
    ITokenClaims,
    MessageType,
    Robot } from "@prague/container-definitions";
import * as core from "@prague/services-core";
import Axios from "axios";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";
import { Provider } from "nconf";
import passport = require("passport");
import { parse } from "url";
import winston = require("winston");

interface IOperation {
    op: string;
    path: string;
    value: string;
}

interface IBaseThing {
}

interface ILocalThing extends IBaseThing {
    url: string;
    token: "";

    // Unclear if we want to specify these or rely on the url above
    orderer: string;
    storage: string;
}

interface IRemoteThing extends IBaseThing {
    data?: string;
}

// Although probably the case we want a default behavior here. Maybe just the URL?
async function getExternalComponent(url: string): Promise<IBaseThing> {
    const result = await Axios.get(url);

    return {
        data: result.data,
    } as IRemoteThing;
}

async function getInternalComponent(url: string): Promise<IBaseThing> {
    return {
        data: null,
        orderer: "",
        storage: "",
        token: "",
        url: "",
    } as ILocalThing;
}

export function create(
    config: Provider,
    producer: core.IProducer,
    appTenants: core.IAlfredTenant[],
    tenantManager: core.ITenantManager,
    storage: core.IDocumentStorage): Router {

    const router: Router = Router();

    const alfred = parse(config.get("worker:serverUrl"));

    router.post("/load", passport.authenticate("jwt", { session: false }), (request, response) => {
        winston.info("/load", request.user);
        winston.info("/load URL", request.body.url);

        // Ok.... so we get a URL
        const url = parse(request.body.url);

        const resultP = alfred.host === url.host
            ? getInternalComponent(request.body.url)
            : getExternalComponent(request.body.url);

        resultP.then(
            (result) => response.status(200).json(result),
            (error) => response.status(400).end(safeStringify(error)));
    });

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
                            user: claims.user,
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

        const message: core.IRawOperationMessage = {
            clientId: null,
            documentId,
            operation,
            tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
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

        const message: core.IRawOperationMessage = {
            clientId,
            documentId,
            operation,
            tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
        };

        return message;
}
