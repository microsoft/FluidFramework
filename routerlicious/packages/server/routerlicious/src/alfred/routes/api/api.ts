import {
    IClient,
    IClientJoin,
    ITokenClaims,
} from "@prague/container-definitions";
import * as core from "@prague/services-core";
import { Router } from "express";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";
import { Provider } from "nconf";
import { craftMessage, craftOp, craftSystemMessage, IOperation } from "./restHelper";

const Robot = "robot";
export function create(
    config: Provider,
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
