/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

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
    ITestFluidObject,
    ITestObjectProvider,
    SupportedExportInterfaces,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { ISharedMap, IValueChanged, SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";

interface ICodeProposalTestPackage extends IFluidPackage {
    version: number,
    schema: number,
}

function isCodeProposalTestPackage(pkg: unknown): pkg is ICodeProposalTestPackage {
    const maybe = pkg as Partial<ICodeProposalTestPackage> | undefined;
    return typeof maybe?.version === "number"
        && typeof maybe?.schema === "number"
        && isFluidPackage(maybe);
}

const mapWait = async <T = any>(map: ISharedMap, key: string): Promise<T> => {
    const maybeValue = map.get<T>(key);
    if (maybeValue !== undefined) {
        return maybeValue;
    }

    return new Promise((resolve) => {
        const handler = (changed: IValueChanged) => {
            if (changed.key === key) {
                map.off("valueChanged", handler);
                const value = map.get<T>(changed.key);
                if (value === undefined) {
                    throw new Error("Unexpected valueChanged result");
                }
                resolve(value);
            }
        };
        map.on("valueChanged", handler);
    });
};

// REVIEW: enable compat testing?
describeNoCompat("CodeProposal.EndToEnd", (getTestObjectProvider) => {
    const packageV1: ICodeProposalTestPackage = {
        name: "test",
        version: 1,
        schema: 1,
        fluid: {},
    };
    const packageV1dot5: ICodeProposalTestPackage = {
        ...packageV1,
        version: 1.5,
    };
    const packageV2: ICodeProposalTestPackage = {
        name: "test",
        version: 2,
        schema: 2,
        fluid: {},
    };
    const codeDetails: IFluidCodeDetails = { package: packageV1 };

    function createLoader() {
        const codeDetailsComparer: IFluidCodeDetailsComparer = {
            get IFluidCodeDetailsComparer() { return this; },
            compare: async (a, b) =>
                isCodeProposalTestPackage(a.package)
                    && isCodeProposalTestPackage(b.package)
                    ? a.package.version - b.package.version
                    : undefined,
            satisfies: async (a, b) =>
                isCodeProposalTestPackage(a.package)
                && isCodeProposalTestPackage(b.package)
                && a.package.schema === b.package.schema,
        };

        const fluidExport: SupportedExportInterfaces = {
            IFluidDataStoreFactory: new TestFluidObjectFactory([["map", SharedMap.getFactory()]]),
            IFluidCodeDetailsComparer: codeDetailsComparer,

        };
        return provider.createLoader(
            [
                [{ package: packageV1 }, fluidExport],
                [{ package: packageV2 }, fluidExport],
                [{ package: packageV1dot5 }, fluidExport],
            ],
        );
    }

    async function createContainer(): Promise<IContainer> {
        const loader = createLoader();
        const container = await createAndAttachContainer(
            codeDetails,
            loader,
            provider.driver.createCreateNewRequest(provider.documentId),
        );
        provider.updateDocumentId(container.resolvedUrl);
        return container;
    }

    async function loadContainer(): Promise<IContainer> {
        const loader = createLoader();
        return loader.resolve({ url: await provider.driver.createContainerUrl(provider.documentId) });
    }

    let provider: ITestObjectProvider;
    let containers: IContainer[];
    beforeEach(async () => {
        provider = getTestObjectProvider();
        containers = [];

        // Create a Container for the first client.
        containers.push(await createContainer());
        await provider.ensureSynchronized();

        // Load the Container that was created by the first client.
        containers.push(await loadContainer());

        assert.deepStrictEqual(
            containers[0].getLoadedCodeDetails?.(),
            codeDetails,
            "Code proposal in containers[0] doesn't match");

        assert.deepStrictEqual(
            containers[1].getLoadedCodeDetails?.(),
            codeDetails,
            "Code proposal in containers[1] doesn't match");

        await testRoundTrip();
    });

    itExpects("Code Proposal",
    [
        {eventName:"fluid:telemetry:Container:ContainerClose", error:"Existing context does not satisfy incoming proposal"},
        {eventName:"fluid:telemetry:Container:ContainerClose", error:"Existing context does not satisfy incoming proposal"},
    ],
    async () => {
        const proposal: IFluidCodeDetails = { package: packageV2 };
        for (let i = 0; i < containers.length; i++) {
            containers[i].once("codeDetailsProposed", (c) => {
                assert.deepStrictEqual(
                    c,
                    proposal,
                    `containers[${i}] context should dispose`);
                assert.strictEqual(
                    containers[i].closed,
                    false,
                    `containers[${i}] should not be closed yet`);
            });

            containers[i].once("contextChanged", () => {
                throw Error(`context should not change for containers[${i}]`);
            });
        }

        const res = await Promise.all([
            containers[0].proposeCodeDetails(proposal),
            provider.ensureSynchronized(),
        ]);
        assert.strictEqual(res[0], true, "Code proposal should be accepted");
        await provider.ensureSynchronized();

        for (let i = 0; i < containers.length; i++) {
            assert.strictEqual(containers[i].closed, true, `containers[${i}] should be closed`);
        }
    });

    it("Code Proposal With Compatible Existing", async () => {
        for (let i = 0; i < containers.length; i++) {
            containers[i].once("contextChanged", () => {
                throw Error(`context should not change for containers[${i}]`);
            });
        }
        const proposal: IFluidCodeDetails = { package: packageV1dot5 };
        const res = await Promise.all([
            containers[0].proposeCodeDetails(proposal),
            provider.ensureSynchronized(),
        ]);

        assert.strictEqual(res[0], true, "Code proposal should be accepted");

        for (let i = 0; i < containers.length; i++) {
            assert.strictEqual(containers[i].closed, false, `containers[${i}] should not be closed`);
            assert.deepStrictEqual(
                containers[i].getLoadedCodeDetails?.(),
                { package: packageV1 },
                `containers[${i}] code details should update`);
        }
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
            waiters.push(...keys.map(async (k) => mapWait(map, k)));
        }

        await Promise.all([provider.ensureSynchronized(), ...waiters]);

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
