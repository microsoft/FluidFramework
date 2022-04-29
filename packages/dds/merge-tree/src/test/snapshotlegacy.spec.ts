/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { MockStorage } from "@fluidframework/test-runtime-utils";
import { SnapshotLegacy } from "../snapshotlegacy";
import { TestSerializer } from "./testSerializer";
import { TestClient } from ".";

describe("snapshot", () => {
    it("header only", async () => {
        const client1 = new TestClient();
        client1.startOrUpdateCollaboration("0");
        for (let i = 0; i < SnapshotLegacy.sizeOfFirstChunk; i++) {
            const op = client1.insertTextLocal(client1.getLength(), `${i % 10}`, { segment: i });
            const msg = client1.makeOpMessage(op, i + 1);
            msg.minimumSequenceNumber = i + 1;
            client1.applyMsg(msg);
        }

        const serializer = new TestSerializer();

        const snapshot = new SnapshotLegacy(client1.mergeTree, client1.logger);
        snapshot.extractSync();
        const summaryTree = snapshot.emit([], serializer, undefined!);
        const services = MockStorage.createFromSummary(summaryTree.summary);

        const client2 = new TestClient(undefined);
        const runtime: Partial<IFluidDataStoreRuntime> = {
            logger: client2.logger,
            clientId: "1",
        };
        await client2.load(runtime as IFluidDataStoreRuntime, services, serializer);

        assert.equal(client2.getLength(), client1.getLength());
        assert.equal(client2.getText(), client1.getText());
    })

        .timeout(5000);

    it("header and body", async () => {
        const clients = [new TestClient(), new TestClient(), new TestClient()];
        clients[0].startOrUpdateCollaboration("0");
        for (let i = 0; i < SnapshotLegacy.sizeOfFirstChunk + 10; i++) {
            const op = clients[0].insertTextLocal(clients[0].getLength(), `${i % 10}`, { segment: i })!;
            const msg = clients[0].makeOpMessage(op, i + 1);
            msg.minimumSequenceNumber = i + 1;
            clients[0].applyMsg(msg);
        }

        const serializer = new TestSerializer();
        for (let i = 0; i < clients.length - 1; i++) {
            const client1 = clients[i];
            const client2 = clients[i + 1];
            const snapshot = new SnapshotLegacy(client1.mergeTree, client1.logger);
            snapshot.extractSync();
            const summaryTree = snapshot.emit([], serializer, undefined!);
            const services = MockStorage.createFromSummary(summaryTree.summary);
            const runtime: Partial<IFluidDataStoreRuntime> = {
                logger: client2.logger,
                clientId: (i + 1).toString(),
            };
            await client2.load(runtime as IFluidDataStoreRuntime, services, serializer);

            const client2Len = client2.getLength();
            assert.equal(
                client2Len,
                client1.getLength(),
                `client${client2.longClientId} and client${client1.longClientId} lengths don't match`);

            assert.equal(
                client2.getText(SnapshotLegacy.sizeOfFirstChunk - 1),
                client1.getText(SnapshotLegacy.sizeOfFirstChunk - 1));
        }
    })

        .timeout(5000);
});
