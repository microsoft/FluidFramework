/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
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

describe("CodeProposal.EndToEnd", () => {
    const documentId = "codeProposalTest";
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

    async function createContainer(factoryEntries: Iterable<[string, IChannelFactory]>): Promise<IContainer> {
        const factory = new TestFluidObjectFactory(factoryEntries);
        const urlResolver = new LocalResolver();
        const loader: ILoader = createLocalLoader(
            [[codeDetails, factory],[codeDetails2,factory]],
             deltaConnectionServer, urlResolver);
        return createAndAttachContainer(documentId, codeDetails, loader, urlResolver) as any as Container;
    }

    async function loadContainer(factoryEntries: Iterable<[string, IChannelFactory]>): Promise<IContainer> {
        const factory = new TestFluidObjectFactory(factoryEntries);
        const urlResolver = new LocalResolver();
        const loader: ILoader = createLocalLoader(
            [[codeDetails, factory],[codeDetails2,factory]],
             deltaConnectionServer, urlResolver);
        return loader.resolve({ url: documentLoadUrl });
    }

    let containers: IContainer[];
    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        containers = [];

        // Create a Container for the first client.
        containers.push(await createContainer([["map", SharedMap.getFactory()]]));

        opProcessingController = new OpProcessingController(deltaConnectionServer);
        opProcessingController.addDeltaManagers(containers[0].deltaManager);

        await opProcessingController.process();

        // Load the Container that was created by the first client.
        containers.push(await loadContainer([["map", SharedMap.getFactory()]]));
        opProcessingController.addDeltaManagers(containers[0].deltaManager);

        assert.deepStrictEqual(
            containers[0].codeDetails,
            codeDetails,
            "Code proposal in containers[0] doesn't match");

        assert.deepStrictEqual(
            containers[1].codeDetails,
            codeDetails,
            "Code proposal in containers[1] doesn't match");

        const dataObject1 = await requestFluidObject<ITestFluidObject>(containers[0], "default");
        const map1 = await dataObject1.getSharedObject<ISharedMap>("map");

        // BUG BUG quorum.propose doesn't handle readonly, so make sure connection is write
        const container = containers[0] as unknown as Container;
        do {
            map1.set("foo","bar");
            await Promise.all([
                new Promise((resolve) => container.connected ? resolve() : container.once("connect", resolve)),
                opProcessingController.process(),
            ]);
        } while (!container.connected);
    });

    it("Code Proposal", async () => {
        for (let i = 0; i < containers.length; i++) {
            containers[i].once("contextDisposed",(c)=>{
                assert.deepStrictEqual(
                    c,
                    codeDetails2,
                    `containers[${i}] context should dispose`);
            });

            containers[i].once("contextChanged",(c)=>{
                assert.deepStrictEqual(
                    c,
                    codeDetails2,
                    `containers[${i}] context should be change`);
            });
        }

        const res = await Promise.all([
            containers[0].proposeCodeDetails(codeDetails2),
            opProcessingController.process(),
        ]);

        assert.strictEqual(res[0], true, "Code propsal should be accepted");

        for (let i = 0; i < containers.length; i++) {
            assert.strictEqual(containers[i].closed, false, `containers[${i}] should not be closed`);
            assert.deepStrictEqual(
                containers[i].codeDetails,
                codeDetails2,
                `containers[${i}] code details should update`);
        }
    });

    it("Code Proposal Rejection", async () => {
        for (let i = 0; i < containers.length; i++) {
            containers[i].once("contextDisposed",(c)=>{
                assert.fail(`Context Shouldn't dispose for containers[${i}]`);
            });

            containers[i].once("contextChanged",(c)=>{
                assert.fail(`Context Shouldn't Change for containers[${i}]`);
            });
        }

        containers[1].on("codeDetailsProposed",(c, p)=>{
                assert.deepStrictEqual(
                    c,
                    codeDetails2,
                    "codeDetails2 should have been proposed");
                p.reject();
            });

        const res = await Promise.all([
            containers[0].proposeCodeDetails(codeDetails2),
            opProcessingController.process(),
        ]);

        assert.strictEqual(res[0], false, "Code propsal should be rejected");

        for (let i = 0; i < containers.length; i++) {
            assert.strictEqual(containers[i].closed, false, `containers[${i}] should not be closed`);
            assert.deepStrictEqual(
                containers[i].codeDetails,
                codeDetails,
                `containers[${i}] code details should not update`);
        }
    });

    it("Close Container on Context Dispose", async () => {
        for (let i = 0; i < containers.length; i++) {
            containers[i].once("contextDisposed",(c)=>{
                assert.deepStrictEqual(
                    c,
                    codeDetails2,
                    `containers[${i}] context should dispose`);
            });
        }

        containers[1].once("contextDisposed",()=>{
            containers[1].close();
            containers[1].once("contextChanged",()=>{
                assert.fail("containers[1]: contextChanged should not fire");
            });
        });

        const res = await Promise.all([
            containers[0].proposeCodeDetails(codeDetails2),
            opProcessingController.process(),
        ]);

        assert.strictEqual(res[0], true, "Code propsal should be accepted");
        assert.strictEqual(containers[0].closed, false, "containers[0] should not be closed");
        assert.deepStrictEqual(
            containers[0].codeDetails,
            codeDetails2,
            `containers[0] code details should update`);

        assert.strictEqual(containers[1].closed, true, "containers[1] should be closed");
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
