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
import {
    createAndAttachContainer,
    createDocumentId,
    createLoader as createLoaderUtil,
    ITestFluidObject,
    OpProcessingController,
    SupportedExportInterfaces,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestDriver } from "@fluidframework/test-driver-definitions";

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
    let driver: ITestDriver;
    before(()=>{
        driver = getFluidTestDriver();
    });

    const packageV1: ICodeProposalTestPackage = {
        name: "test",
        version: 1,
        schema: 1,
        fluid: {},
    };
    const packageV1dot5: ICodeProposalTestPackage = {
        ... packageV1,
        version: 1.5,
    };
    const packageV2: ICodeProposalTestPackage = {
        name: "test",
        version: 2,
        schema: 2,
        fluid: {},
    };

    let opProcessingController: OpProcessingController;
    let hotSwapContext = false;

    function createLoader() {
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

        const fluidExport: SupportedExportInterfaces = {
            IFluidDataStoreFactory: new TestFluidObjectFactory([["map", SharedMap.getFactory()]]),
            IFluidCodeDetailsComparer: codeDetailsComparer,

        };
        return createLoaderUtil(
            [
                [{ package: packageV1 }, fluidExport],
                [{ package: packageV2 },fluidExport],
                [{ package: packageV1dot5 }, fluidExport],
            ],
            driver.createDocumentServiceFactory(),
            driver.createUrlResolver(),
            { hotSwapContext });
    }

    async function createContainer(code: IFluidCodeDetails, documentId: string): Promise<IContainer> {
        const loader = createLoader();
        return createAndAttachContainer(code, loader, driver.createCreateNewRequest(documentId));
    }

    async function loadContainer(documentId: string): Promise<IContainer> {
        const loader = createLoader();
        return loader.resolve({ url: driver.createContainerUrl(documentId) });
    }

    let containers: IContainer[];
    beforeEach(async () => {
        containers = [];
        const documentId = createDocumentId();
        const codeDetails: IFluidCodeDetails = { package: packageV1 };

        // Create a Container for the first client.
        containers.push(await createContainer(codeDetails, documentId));

        opProcessingController = new OpProcessingController();
        opProcessingController.addDeltaManagers(containers[0].deltaManager);

        await opProcessingController.process();

        // Load the Container that was created by the first client.
        containers.push(await loadContainer(documentId));
        opProcessingController.addDeltaManagers(containers[1].deltaManager);

        assert.deepStrictEqual(
            containers[0].codeDetails,
            codeDetails,
            "Code proposal in containers[0] doesn't match");

        assert.deepStrictEqual(
            containers[1].codeDetails,
            codeDetails,
            "Code proposal in containers[1] doesn't match");

        await testRoundTrip();
    });

    it("Code Proposal", async () => {
        const proposal: IFluidCodeDetails = { package: packageV2 };
        for (let i = 0; i < containers.length; i++) {
            containers[i].once("contextDisposed",(c)=>{
                assert.deepStrictEqual(
                    c,
                    proposal,
                    `containers[${i}] context should dispose`);
                assert.strictEqual(
                    containers[i].closed,
                    false,
                    `containers[${i}] should not be closed yet`);
            });

            containers[i].once("contextChanged",()=>{
                throw Error(`context should not change for containers[${i}]`);
            });
        }

        const res = await Promise.all([
            containers[0].proposeCodeDetails(proposal),
            opProcessingController.process(),
        ]);
        assert.strictEqual(res[0], true, "Code proposal should be accepted");
        await opProcessingController.process();

        for (let i = 0; i < containers.length; i++) {
            assert.strictEqual(containers[i].closed, true, `containers[${i}] should be closed`);
        }
    });

    it("Code Proposal Rejection", async () => {
        for (let i = 0; i < containers.length; i++) {
            containers[i].once("contextDisposed",()=>{
                throw Error(`context should not dispose for containers[${i}]`);
            });

            containers[i].once("contextChanged",()=>{
                throw Error(`context should not change for containers[${i}]`);
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

        assert.strictEqual(res[0], false, "Code proposal should be rejected");

        for (let i = 0; i < containers.length; i++) {
            assert.strictEqual(containers[i].closed, false, `containers[${i}] should not be closed`);
            assert.deepStrictEqual(
                containers[i].codeDetails,
                { package: packageV1 },
                `containers[${i}] code details should not update`);
        }
    });

    it("Code Proposal With Compatible Existing", async () => {
        for (let i = 0; i < containers.length; i++) {
            containers[i].once("contextDisposed",()=>{
                throw Error(`context should not dispose for containers[${i}]`);
            });

            containers[i].once("contextChanged",()=>{
                throw Error(`context should not change for containers[${i}]`);
            });
        }
        const proposal: IFluidCodeDetails = { package: packageV1dot5 };
        const res = await Promise.all([
            containers[0].proposeCodeDetails(proposal),
            opProcessingController.process(),
        ]);

        assert.strictEqual(res[0], true, "Code proposal should be accepted");

        for (let i = 0; i < containers.length; i++) {
            assert.strictEqual(containers[i].closed, false, `containers[${i}] should not be closed`);
            assert.deepStrictEqual(
                containers[i].codeDetails,
                { package: packageV1 },
                `containers[${i}] code details should update`);
        }
    });

    describe("(hot-swap)", () => {
        before(() => hotSwapContext = true);
        after(() => hotSwapContext = false);

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

            assert.strictEqual(res[0], true, "Code proposal should be accepted");
            await opProcessingController.process();

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
                    assert.fail(`context should not dispose for containers[${i}]`);
                });

                containers[i].once("contextChanged",(c)=>{
                    assert.fail(`context should not change for containers[${i}]`);
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

            assert.strictEqual(res[0], false, "Code proposal should be rejected");

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

            assert.strictEqual(res[0], true, "Code proposal should be accepted");
            assert.strictEqual(containers[0].closed, false, "containers[0] should not be closed");
            await opProcessingController.process();

            assert.deepStrictEqual(
                containers[0].codeDetails,
                proposal,
                `containers[0] code details should update`);

            assert.strictEqual(containers[1].closed, true, "containers[1] should be closed");
        });

        it("Code Proposal With Compatible Existing", async () => {
            for (let i = 0; i < containers.length; i++) {
                containers[i].once("contextDisposed",(c)=>{
                    assert.fail(`context should not dispose for containers[${i}]`);
                });

                containers[i].once("contextChanged",(c)=>{
                    assert.fail(`context should not change for containers[${i}]`);
                });
            }
            const proposal: IFluidCodeDetails = { package: packageV1dot5 };
            const res = await Promise.all([
                containers[0].proposeCodeDetails(proposal),
                opProcessingController.process(),
            ]);

            assert.strictEqual(res[0], true, "Code proposal should be accepted");

            for (let i = 0; i < containers.length; i++) {
                assert.strictEqual(containers[i].closed, false, `containers[${i}] should not be closed`);
                assert.deepStrictEqual(
                    containers[i].codeDetails,
                    { package: packageV1 },
                    `containers[${i}] code details should update`);
            }
        });
    });

    async function testRoundTrip() {
        const keys: string[] = [];
        const maps: ISharedMap[] = [];
        for (const container of containers) {
            if (!container.closed) {
                const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
                const map = await dataObject.getSharedObject<ISharedMap>("map");
                const key = createDocumentId();
                map.set(key, key);
                keys.push(key);
                maps.push(map);
            }
        }
        const waiters: Promise<void>[] = [];
        for (const map of maps) {
            waiters.push(... keys.map(async (k)=>map.wait(k)));
        }

        await Promise.all([opProcessingController.process(), ...waiters]);

        for (const map of maps) {
            for (const key of keys) {
                assert.strictEqual(map.get(key), key);
            }
        }
    }

    afterEach(async () => {
        await testRoundTrip();
    });
});
