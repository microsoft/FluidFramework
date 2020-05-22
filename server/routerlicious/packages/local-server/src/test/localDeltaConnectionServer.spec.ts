/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { generateToken } from "@fluidframework/server-services-client";
import {
    ScopeType,
    IUser,
    MessageType,
    ISequencedDocumentSystemMessage,
    IClient,
} from  "@fluidframework/protocol-definitions";
import { Deferred } from "@fluidframework/common-utils";
import { LocalDeltaConnectionServer } from "../localDeltaConnectionServer";

describe("LocalDeltaConnectionServer", ()=>{
    it("connectWebSocket and validate join", async ()=>{
        const lts = LocalDeltaConnectionServer.create();
        const user: IUser = { id: "id" };
        const client: IClient = {
            details: { capabilities:{ interactive: true } },
            mode: "write",
            permission: [],
            scopes: [],
            user,
        };

        const joinHandler = (joinP: Deferred<any>, msgs: ISequencedDocumentSystemMessage[])=>{
            for (const msg of msgs) {
                if (joinP.isCompleted === false) {
                    if (msg.type !== MessageType.ClientJoin) {
                        joinP.reject(`expected join msg:\n${JSON.stringify(msg, undefined, 1)}`);
                    } else {
                        joinP.resolve(JSON.parse(msg.data));
                    }
                }
            }
        };

        const token =
            generateToken(
                "tenant",
                "document",
                "key",
                [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
                user);

        const [socket1, connected1P] = lts.connectWebSocket(
            "tenant",
            "document",
            token,
            client,
            ["^0.4.0"],
        );

        const join1P = new Deferred<any>();
        socket1.on(
            "op",
            (documentId: string, msgs: ISequencedDocumentSystemMessage[]) => joinHandler(join1P, msgs));

        const connected1 = await connected1P;
        assert.equal(connected1.existing, false);
        const join1 = await join1P.promise;
        assert.equal(connected1.clientId, join1.clientId);

        const [socket2, connected2P] = lts.connectWebSocket(
            "tenant",
            "document",
            token,
            client,
            ["^0.4.0"],
        );

        const join2P = new Deferred<any>();
        socket2.on(
            "op",
            (documentId: string, msgs: ISequencedDocumentSystemMessage[]) => joinHandler(join2P, msgs));

        const connected2 = await connected2P;
        assert.equal(connected2.existing, true);
        const join2 = await join2P.promise;
        assert.equal(connected2.clientId, join2.clientId);
        assert.notEqual(connected2.clientId, connected1.clientId);
    });
});
