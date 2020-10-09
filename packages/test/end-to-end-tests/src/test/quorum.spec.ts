/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {  IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    createLocalLoader,
    ITestFluidObject,
    OpProcessingController,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { LocalResolver } from "@fluidframework/local-driver";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";

describe("Quorum.EndToEnd", () => {
    const documentId = "sharedIntervalTest";
    const documentLoadUrl = `fluid-test://localhost/${documentId}`;
    const codeDetails: IFluidCodeDetails = {
        package: "test",
        config: {},
    };
    const codeDetails2: IFluidCodeDetails = {
        package: "test2",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let opProcessingController: OpProcessingController;

    async function createContainer(factoryEntries: Iterable<[string, IChannelFactory]>): Promise<Container> {
        const factory = new TestFluidObjectFactory(factoryEntries);
        const urlResolver = new LocalResolver();
        const loader: ILoader = createLocalLoader(
            [[codeDetails, factory],[codeDetails2,factory]],
             deltaConnectionServer, urlResolver);
        return createAndAttachContainer(documentId, codeDetails, loader, urlResolver) as any as Container;
    }

    async function loadContainer(factoryEntries: Iterable<[string, IChannelFactory]>): Promise<Container> {
        const factory = new TestFluidObjectFactory(factoryEntries);
        const urlResolver = new LocalResolver();
        const loader: ILoader = createLocalLoader(
            [[codeDetails, factory],[codeDetails2,factory]],
             deltaConnectionServer, urlResolver);
        return loader.resolve({ url: documentLoadUrl }) as any as Container;
    }

    describe("multiple clients", () => {
        let container1: Container;
        let container2: Container;
        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();

            // Create a Container for the first client.
            container1 = await createContainer([["map", SharedMap.getFactory()]]);

            opProcessingController = new OpProcessingController(deltaConnectionServer);
            opProcessingController.addDeltaManagers(container1.deltaManager);

            await opProcessingController.process();

            // Load the Container that was created by the first client.
            container2 = await loadContainer([["map", SharedMap.getFactory()]]);
            opProcessingController.addDeltaManagers(container1.deltaManager);

            const quorum1 = container1.getQuorum();
            const quorum2 = container2.getQuorum();

            assert.deepStrictEqual(
                quorum1.get("code"),
                codeDetails,
                "Code proposal in container1 doesn't match");

            assert.deepStrictEqual(
                quorum2.get("code"),
                codeDetails,
                "Code proposal in container2 doesn't match");

            const dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
            const map1 = await dataObject1.getSharedObject<ISharedMap>("map");

            // BUG BUG quorum.propose doesn't handle readonly, so make sure connection is write
            while (container1.deltaManager.connectionMode === "read" || !container1.connected) {
                map1.set("foo","bar");
                await Promise.all([
                    new Promise((resolve) => container1.connected ? resolve() : container1.once("connect", resolve)),
                    opProcessingController.process(),
                ]);
            }
        });

        it("Code Proposal", async () => {
            const quorum1 = container1.getQuorum();
            const quorum2 = container2.getQuorum();

            await Promise.all([
                quorum1.propose("code", codeDetails2),
                opProcessingController.process(),
            ]);

            assert.deepStrictEqual(
                quorum1.get("code"),
                codeDetails2,
                "Code proposal in container1 should be updated");

            assert.deepStrictEqual(
                quorum2.get("code"),
                codeDetails2,
                "Code proposal in container1 should be updated");
        });

        it("Code Proposal Rejection", async () => {
            const quorum1 = container1.getQuorum();
            const quorum2 = container2.getQuorum();

            quorum2.on("addProposal",(p)=>{
                if (p.key === "code") {
                    p.reject();
                }
            });

            await Promise.all([
                quorum1.propose("code", codeDetails2)
                    .then(()=>assert.fail("expected rejection"))
                    .catch(()=>{}),
                opProcessingController.process(),
            ]);

            assert.deepStrictEqual(
                quorum1.get("code"),
                codeDetails,
                "Code proposal in container1 shouldn't be updated");

            assert.deepStrictEqual(
                quorum2.get("code"),
                codeDetails,
                "Code proposal in container1 shouldn't be updated");
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });
});
