/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelServices } from "@fluidframework/datastore-definitions";
import {
    MockContainerRuntimeFactoryForReconnection,
    MockFluidDataStoreRuntime,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { IntervalType } from "../intervalCollection";
import { SharedStringFactory } from "../sequenceFactory";
import { SharedString } from "../sharedString";
import { assertConsistent, Client } from "./intervalUtils";

function constructClients(
    containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
    numClients = 3,
): [Client, Client, Client] {
    return Array.from({ length: numClients }, (_, index) => {
        const dataStoreRuntime = new MockFluidDataStoreRuntime();
        const sharedString = new SharedString(
            dataStoreRuntime,
            String.fromCharCode(index + 65),
            SharedStringFactory.Attributes,
        );
        const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
        const services: IChannelServices = {
            deltaConnection: containerRuntime.createDeltaConnection(),
            objectStorage: new MockStorage(),
        };

        sharedString.initializeLocal();
        sharedString.connect(services);
        return { containerRuntime, sharedString };
    }) as [Client, Client, Client];
}

describe("interval rebasing", () => {
    let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
    let clients: [Client, Client, Client];

    beforeEach(() => {
        containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
        clients = constructClients(containerRuntimeFactory);
    });

    it("does not crash for an interval that lies on segment that has been removed locally", () => {
        clients[0].sharedString.insertText(0, "A");
        clients[1].containerRuntime.connected = false;
        clients[1].sharedString.insertText(0, "01234");
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
        clients[1].containerRuntime.connected = true;
        clients[0].sharedString.insertText(0, "012345678901234");
        clients[0].containerRuntime.connected = false;
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
        const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
        collection_0.add(12, 15, IntervalType.SlideOnRemove, { intervalId: "id" });
        clients[2].sharedString.removeRange(5, 7);
        clients[0].sharedString.removeRange(3, 5);
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
        clients[0].sharedString.insertText(13, "0123");
        clients[0].containerRuntime.connected = true;
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
    });

    it("does not crash when entire string on which interval lies is concurrently removed", () => {
        clients[0].sharedString.insertText(0, "a");
        clients[1].sharedString.insertText(0, "a");
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
        clients[0].containerRuntime.connected = false;
        clients[1].sharedString.removeRange(0, 2);
        const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
        collection_0.add(0, 1, IntervalType.SlideOnRemove, { intervalId: "id" });
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
        clients[0].containerRuntime.connected = true;
    });

    it("does not crash when interval is removed before reconnect when string is concurrently removed", () => {
        clients[0].sharedString.insertText(0, "a");
        clients[1].sharedString.insertText(0, "a");
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
        clients[0].containerRuntime.connected = false;
        clients[1].sharedString.removeRange(0, 2);
        const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
        collection_0.add(0, 1, IntervalType.SlideOnRemove, { intervalId: "id" });
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
        collection_0.removeIntervalById("id");
        clients[0].containerRuntime.connected = true;
    });

    it("does not crash when interval slides off end of string", () => {
        clients[0].sharedString.insertText(0, "012Z45");
        clients[2].sharedString.insertText(0, "X");
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
        clients[1].sharedString.insertText(0, "01234567");
        clients[0].containerRuntime.connected = false;
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
        clients[0].sharedString.insertText(0, "ABCDEFGHIJKLMN");
        const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
        collection_0.add(20, 20, IntervalType.SlideOnRemove, { intervalId: "414e09e9-54bf-43ea-9809-9fc5724c43fe" });
        clients[2].sharedString.removeRange(13, 15);
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
        clients[0].containerRuntime.connected = true;
        containerRuntimeFactory.processAllMessages();
        assertConsistent(clients);
    });
});
