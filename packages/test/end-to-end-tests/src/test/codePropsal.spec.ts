/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import {
    IFluidCodeDetails,
    IFluidCodeDetailsComparer,
    IFluidPackage,
    isFluidPackage,
} from "@fluidframework/core-interfaces";
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

interface ICodeProposalTestPackage extends IFluidPackage{
    version: number,
    schema: number,
}

function isCodeProposalTestPackage(pkg: unknown): pkg is ICodeProposalTestPackage {
    const maybe = pkg as Partial<ICodeProposalTestPackage> | undefined;
    return typeof maybe?.version === "number"
    && typeof maybe?.schema === "number"
    && isFluidPackage(maybe);
}

describe("CodeProposal.EndToEnd", () => {
    const documentId = "codeProposalTest";
    const documentLoadUrl = `fluid-test://localhost/${documentId}`;
    const packageV1: ICodeProposalTestPackage = {
        name: "test",
        version: 1,
        schema: 1,
        fluid: {},
    };
    const packageV2: ICodeProposalTestPackage = {
        name: "test",
        version: 2,
        schema: 2,
        fluid: {},
    };
    const packageV2dot5: ICodeProposalTestPackage = {
        name: "test",
        version: 2.5,
        schema: 2,
        fluid: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let opProcessingController: OpProcessingController;

    function createLoader(urlResolver: LocalResolver) {
        const codeDetailsComparer: IFluidCodeDetailsComparer = {
            get IFluidCodeDetailsComparer() {return this;},
            compare: async (a, b)=>
                isCodeProposalTestPackage(a.package)
                && isCodeProposalTestPackage(b.package)
                    ? a.package.version - b.package.version
                    : undefined,
            satisfies: async (a,b)=>
                isCodeProposalTestPackage(a.package)
                && isCodeProposalTestPackage(b.package)
                && a.package.schema === b.package.schema,
        };

        const factory = new TestFluidObjectFactory([["map", SharedMap.getFactory()]]);
        return createLocalLoader(
            [
                [{ package: packageV1 }, factory],
                [{ package: packageV2 }, {
                    IFluidDataStoreFactory: factory,
                    IFluidCodeDetailsComparer: codeDetailsComparer,
                }],
                [{ package: packageV2dot5 }, {
                    IFluidDataStoreFactory: factory,
                    IFluidCodeDetailsComparer: codeDetailsComparer,
                }],
            ],
            deltaConnectionServer, urlResolver);
    }

    async function createContainer(code: IFluidCodeDetails): Promise<IContainer> {
        const urlResolver = new LocalResolver();
        const loader = createLoader(urlResolver);
        return createAndAttachContainer(documentId, code, loader, urlResolver);
    }

    async function loadContainer(): Promise<IContainer> {
        const urlResolver = new LocalResolver();
        const loader = createLoader(urlResolver);
        return loader.resolve({ url: documentLoadUrl });
    }

    let containers: IContainer[];
    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        containers = [];

        const codeDetails: IFluidCodeDetails = { package: packageV1 };

        // Create a Container for the first client.
        containers.push(await createContainer(codeDetails));

        opProcessingController = new OpProcessingController(deltaConnectionServer);
        opProcessingController.addDeltaManagers(containers[0].deltaManager);

        await opProcessingController.process();

        // Load the Container that was created by the first client.
        containers.push(await loadContainer());
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
        const map0 = await dataObject1.getSharedObject<ISharedMap>("map");

        // BUG BUG quorum.propose doesn't handle readonly, so make sure connection is write
        const container = containers[0] as unknown as Container;
        do {
            map0.set("foo","bar");
            await Promise.all([
                new Promise((resolve) => container.connected ? resolve() : container.once("connect", resolve)),
                opProcessingController.process(),
            ]);
        } while (!container.connected);
    });

    it("Code Proposal", async () => {
        const proposal: IFluidCodeDetails = { package: packageV2 };
        for (let i = 0; i < containers.length; i++) {
            containers[i].once("contextDisposed",(c)=>{
                assert.deepStrictEqual(
                    c,
                    proposal,
                    `containers[${i}] context should dispose`);
            });

            containers[i].once("contextChanged",(c)=>{
                assert.deepStrictEqual(
                    c,
                    proposal,
                    `containers[${i}] context should be change`);
            });
        }

        const res = await Promise.all([
            containers[0].proposeCodeDetails(proposal),
            opProcessingController.process(),
        ]);

        assert.strictEqual(res[0], true, "Code propsal should be accepted");

        for (let i = 0; i < containers.length; i++) {
            assert.strictEqual(containers[i].closed, false, `containers[${i}] should not be closed`);
            assert.deepStrictEqual(
                containers[i].codeDetails,
                proposal,
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

        const proposal: IFluidCodeDetails = { package: packageV2 };
        containers[1].on("codeDetailsProposed",(c, p)=>{
                assert.deepStrictEqual(
                    c,
                    proposal,
                    "codeDetails2 should have been proposed");
                p.reject();
            });

        const res = await Promise.all([
            containers[0].proposeCodeDetails(proposal),
            opProcessingController.process(),
        ]);

        assert.strictEqual(res[0], false, "Code propsal should be rejected");

        for (let i = 0; i < containers.length; i++) {
            assert.strictEqual(containers[i].closed, false, `containers[${i}] should not be closed`);
            assert.deepStrictEqual(
                containers[i].codeDetails,
                { package: packageV1 },
                `containers[${i}] code details should not update`);
        }
    });

    it("Close Container on Context Dispose", async () => {
        const proposal: IFluidCodeDetails = { package: packageV2 };
        for (let i = 0; i < containers.length; i++) {
            containers[i].once("contextDisposed",(c)=>{
                assert.deepStrictEqual(
                    c,
                    proposal,
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
            containers[0].proposeCodeDetails(proposal),
            opProcessingController.process(),
        ]);

        assert.strictEqual(res[0], true, "Code propsal should be accepted");
        assert.strictEqual(containers[0].closed, false, "containers[0] should not be closed");
        assert.deepStrictEqual(
            containers[0].codeDetails,
            proposal,
            `containers[0] code details should update`);

        assert.strictEqual(containers[1].closed, true, "containers[1] should be closed");
    });

    it.skip("Compatible Code Proposal", async () => {
        const proposal1: IFluidCodeDetails = { package: packageV2 };
        const res = await Promise.all([
            containers[0].proposeCodeDetails(proposal1),
            opProcessingController.process(),
            ... containers.map(async (c)=>new Promise((resolve)=> c.once("contextChanged", resolve))),
        ]);

        assert.strictEqual(res[0], true, "Code propsal should be accepted");

        for (let i = 0; i < containers.length; i++) {
            assert.strictEqual(containers[i].closed, false, `containers[${i}] should not be closed`);
            assert.deepStrictEqual(
                containers[i].codeDetails,
                proposal1,
                `containers[${i}] code details should update`);
        }

        for (let i = 0; i < containers.length; i++) {
            containers[i].once("contextDisposed",(c)=>{
                assert.fail(`Context Shouldn't dispose for containers[${i}]`);
            });

            containers[i].once("contextChanged",(c)=>{
                assert.fail(`Context Shouldn't Change for containers[${i}]`);
            });
        }
        const proposal2: IFluidCodeDetails = { package: packageV2dot5 };
        const res2 = await Promise.all([
            containers[0].proposeCodeDetails(proposal2),
            opProcessingController.process(),
        ]);

        assert.strictEqual(res2[0], true, "Code propsal should be accepted");

        for (let i = 0; i < containers.length; i++) {
            assert.strictEqual(containers[i].closed, false, `containers[${i}] should not be closed`);
            assert.deepStrictEqual(
                containers[i].codeDetails,
                proposal2,
                `containers[${i}] code details should update`);
        }
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
