/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IsoBuffer } from "@fluidframework/common-utils";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalResolver } from "@fluidframework/local-driver";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createAndAttachContainer, createLocalLoader, TestContainerRuntimeFactory } from "@fluidframework/test-utils";

class TestComponent extends DataObject {
    public static readonly type = "@fluid-example/test-component";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

describe("blobs", () => {
    const docId = "localLoaderTest";
    const codeDetails: IFluidCodeDetails = {
        package: "localLoaderTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let urlResolver: IUrlResolver;

    async function createContainer(): Promise<IContainer> {
        const fluidModule = {
            fluidExport: new TestContainerRuntimeFactory(
                TestComponent.type,
                new DataObjectFactory(TestComponent.type, TestComponent, [], {}),
                { initialSummarizerDelayMs: 100 },
            ),
        };
        const loader = createLocalLoader([[codeDetails, fluidModule]], deltaConnectionServer, urlResolver);
        return createAndAttachContainer(docId, codeDetails, loader, urlResolver);
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create(
            undefined,
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            { summary: { maxOps: 1 } as ISummaryConfiguration },
        );
        urlResolver = new LocalResolver();
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });

    it("attach sends an op", async function() {
        const container = await createContainer();

        const blobOpP = new Promise((res) => container.on("op", (op) => {
            if (op.contents?.type === ContainerMessageType.BlobAttach) {
                res();
            }
        }));

        const component = await requestFluidObject<TestComponent>(container, "default");
        const blob = await component._runtime.uploadBlob(IsoBuffer.from("some random text"));

        component._root.set("my blob", blob);

        await blobOpP;
    });

    it("can get remote attached blob", async function() {
        const testString = "this is a test string";
        const testKey = "a blob";
        const container1 = await createContainer();

        const component1 = await requestFluidObject<TestComponent>(container1, "default");

        const blob = await component1._runtime.uploadBlob(IsoBuffer.from(testString, "utf-8"));
        component1._root.set(testKey, blob);

        const container2 = await createContainer();
        const component2 = await requestFluidObject<TestComponent>(container2, "default");

        const blobHandle = await component2._root.wait(testKey);
        assert.strictEqual((await blobHandle.get()).toString("utf-8"), testString);
    });
});
