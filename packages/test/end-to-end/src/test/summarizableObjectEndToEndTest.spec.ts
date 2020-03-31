/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as api from "@fluid-internal/client-api";
import { ISummarizableObject } from "@microsoft/fluid-summarizable-object";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    DocumentDeltaEventManager,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { ISharedMap } from "@microsoft/fluid-map";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";

describe("SummarizableObject", () => {
    /**
     * The following tests emulate the "Last Edited User" feature:
     * - It registers request handlers for ops in the container runtime which stores the last user information
     *   in a SummariazbleObject.
     * - It verifies that the user information is set properly in the SummarizableObject in all the documents.
     * - It verifies that the SummarizableObject does not generate any ops.
     */
    describe("Last Edited User", () => {
        const id = "fluid://test.com/test/test";
        const objectId = "summarizableObjectKey";
        const userKey = "user";

        let testDeltaConnectionServer: ILocalDeltaConnectionServer;
        let documentDeltaEventManager: DocumentDeltaEventManager;
        let user1Document: api.Document;
        let user2Document: api.Document;
        let user3Document: api.Document;
        let root1: ISharedMap;
        let root2: ISharedMap;
        let root3: ISharedMap;
        let root1Object: ISummarizableObject;
        let root2Object: ISummarizableObject;
        let root3Object: ISummarizableObject;

        beforeEach(async () => {
            testDeltaConnectionServer = LocalDeltaConnectionServer.create();
            documentDeltaEventManager = new DocumentDeltaEventManager(testDeltaConnectionServer);
            const serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
            const resolver = new TestResolver();

            user1Document = await api.load(
                id, resolver, {}, serviceFactory);
            documentDeltaEventManager.registerDocuments(user1Document);

            user2Document = await api.load(
                id, resolver, {}, serviceFactory);
            documentDeltaEventManager.registerDocuments(user2Document);

            user3Document = await api.load(
                id, resolver, {}, serviceFactory);
            documentDeltaEventManager.registerDocuments(user3Document);

            root1 = user1Document.getRoot();
            root2 = user2Document.getRoot();
            root3 = user3Document.getRoot();
            await documentDeltaEventManager.pauseProcessing();

            // Create a summzariable object on the root and propagate it to other documents.
            root1.set(objectId, user1Document.createSummarizableObject().handle);
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

            root1Object = await root1.get<IComponentHandle<ISummarizableObject>>(objectId).get();
            root2Object = await root2.get<IComponentHandle<ISummarizableObject>>(objectId).get();
            root3Object = await root3.get<IComponentHandle<ISummarizableObject>>(objectId).get();

            // Register op handlers for the each document that updates the last edited user in the SummarizableObject
            // as per the user in the op.
            user1Document.context.hostRuntime.on("op", (message: ISequencedDocumentMessage) => {
                root1Object.set(userKey, message.clientId);
            });
            user2Document.context.hostRuntime.on("op", (message: ISequencedDocumentMessage) => {
                root2Object.set(userKey, message.clientId);
            });
            user3Document.context.hostRuntime.on("op", (message: ISequencedDocumentMessage) => {
                root3Object.set(userKey, message.clientId);
            });
        });

        function verifyLastEditedUser(user: string) {
            assert.equal(root1Object.get(userKey), user, "Last edited user not set correctly in document 1");
            assert.equal(root2Object.get(userKey), user, "Last edited user not set correctly in document 1");
            assert.equal(root3Object.get(userKey), user, "Last edited user not set correctly in document 1");
        }

        it("can create the summarizable object in 3 documents correctly", async () => {
            // SummarizableObject was created and populated in beforeEach.
            assert.ok(root1Object, `Couldn't find the object in root1, instead got ${root1Object}`);
            assert.ok(root2Object, `Couldn't find the object in root2, instead got ${root2Object}`);
            assert.ok(root3Object, `Couldn't find the object in root3, instead got ${root3Object}`);
        });

        it("can set and get last edited user in summarizable object in 3 documents correctly", async () => {
            root1.set("key", "value");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            verifyLastEditedUser(user1Document.clientId);
        });

        it("can set and get last edited user in summarizable object when 3 documents write concurrently", async () => {
            root1.set("key1", "value1");
            root2.set("key2", "value2");
            root3.set("key3", "value3");
            root3.set("key4", "value4");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            verifyLastEditedUser(user3Document.clientId);
        });

        it("should not generate op for summarizable object", async () => {
            // Set up op handler for the summarizable object and assert if op is generated.
            root1Object.on("op", () => {
                assert(false, "SummarizableObject should not generate any ops.");
            });
            root1.set("key", "value");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
        });

        afterEach(async () => {
            const closeP: Promise<void>[] = [];
            /* eslint-disable @typescript-eslint/strict-boolean-expressions */
            if (user1Document) { closeP.push(user1Document.close()); }
            if (user2Document) { closeP.push(user2Document.close()); }
            if (user3Document) { closeP.push(user3Document.close()); }
            /* eslint-enable @typescript-eslint/strict-boolean-expressions */
            await Promise.all(closeP);
            await testDeltaConnectionServer.webSocketServer.close();
        });
    });
});
