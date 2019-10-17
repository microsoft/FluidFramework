/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IClientSequenceNumber } from "../../deli/checkpointContext";
import { ClientSequenceNumberManager } from "../../deli/clientSeqManager";
import { ClientSequenceTimeout } from "../../deli/lambdaFactory";

describe("Routerlicious.Deli.ClientSequenceNumberManager", () => {

    describe("getIdleClient", () => {
        it("No clients idle", () => {
            const manager = new ClientSequenceNumberManager(ClientSequenceTimeout);

            manager.upsertClient("c1", 0, 0, Date.now(), true);
            manager.upsertClient("c2", 0, 0, Date.now(), true);

            const idleClient = manager.getIdleClient();
            assert.equal(idleClient, undefined);
        });

        it("Client is idle", () => {
            const manager = new ClientSequenceNumberManager(ClientSequenceTimeout);

            manager.upsertClient("c1", 0, 0, Date.now(), true);
            const c1 = manager.get("c1");
            manager.upsertClient("c2", 0, 0, Date.now(), true);
            const c2 = manager.get("c2");

            while (c1.lastUpdate - c2.lastUpdate <= ClientSequenceTimeout) {
                // don't let full idle engage
                c1.lastUpdate += ClientSequenceTimeout - 1;
                updateClient(manager, c1);
            }

            const idleClient = manager.getIdleClient();
            assert.notEqual(idleClient, undefined);
            assert.equal(idleClient.clientId, c2.clientId);
        });

        it("No update before timeout or full idle", () => {
            const manager = new ClientSequenceNumberManager(ClientSequenceTimeout);

            manager.upsertClient("c1", 0, 0, Date.now(), true);
            const c1 = manager.get("c1");
            manager.upsertClient("c2", 0, 0, Date.now(), true);
            const c2 = manager.get("c2");

            while (c2.lastUpdate > manager.lastFullIdlePeriod.start - ClientSequenceTimeout) {
                // make sure full idle starts
                c1.lastUpdate += ClientSequenceTimeout + 1;
                updateClient(manager, c1);
            }

            const idleClient = manager.getIdleClient();
            assert.notEqual(idleClient, undefined);
            assert.equal(idleClient.clientId, c2.clientId);
        });

        it("Update before timeout and before full idle", () => {
            const manager = new ClientSequenceNumberManager(ClientSequenceTimeout);

            manager.upsertClient("c1", 0, 0, Date.now(), true);
            const c1 = manager.get("c1");
            manager.upsertClient("c2", 0, 0, Date.now(), true);

            // make sure full idle starts
            c1.lastUpdate += ClientSequenceTimeout + 1;
            updateClient(manager, c1);

            const idleClient = manager.getIdleClient();
            assert.equal(idleClient, undefined);
        });

        it("Last update after full idle and before timeout", () => {
            const manager = new ClientSequenceNumberManager(ClientSequenceTimeout);

            manager.upsertClient("c1", 0, 0, Date.now(), true);
            const c1 = manager.get("c1");
            manager.upsertClient("c2", 0, 0, Date.now(), true);
            const c2 = manager.get("c2");

            // enter full idle
            c1.lastUpdate += ClientSequenceTimeout + 1;
            updateClient(manager, c1);

            // move c2 passed full idle
            c2.lastUpdate = c1.lastUpdate + 1;
            updateClient(manager, c2);

            while (c1.lastUpdate - c2.lastUpdate <= ClientSequenceTimeout) {
                // don't let full idle engage again
                c1.lastUpdate += ClientSequenceTimeout - 1;
                updateClient(manager, c1);
            }

            const idleClient = manager.getIdleClient();
            assert.notEqual(idleClient, undefined);
            assert.equal(idleClient.clientId, c2.clientId);
        });
    });
});

function updateClient(
    manager: ClientSequenceNumberManager,
    client: IClientSequenceNumber,
    incrementSeqs: boolean = true,
) {
    if (incrementSeqs) {
        client.clientSequenceNumber++;
        client.referenceSequenceNumber++;
    }
    manager.upsertClient(
        client.clientId,
        client.clientSequenceNumber,
        client.referenceSequenceNumber,
        client.lastUpdate,
        client.canEvict);
}
