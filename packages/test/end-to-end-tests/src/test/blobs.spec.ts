/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { BlobHandle, ContainerMessageType } from "@fluidframework/container-runtime";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, initializeLocalContainer, TestContainerRuntimeFactory } from "@fluidframework/test-utils";

class TestComponent extends DataObject {
    public static readonly type = "@fluid-example/test-component";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

describe("blobs", () => {
    const id = "fluid-test://localhost/localLoaderTest";
    const codeDetails: IFluidCodeDetails = {
        package: "localLoaderTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;

    async function createContainer(): Promise<Container> {
        const fluidModule = {
            fluidExport: new TestContainerRuntimeFactory(
                TestComponent.type,
                new DataObjectFactory(TestComponent.type, TestComponent, [], {}),
                { initialSummarizerDelayMs: 100 },
            ),
        };
        const loader = createLocalLoader([[codeDetails, fluidModule]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create(
            undefined,
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            { summary: { maxOps: 1 } as ISummaryConfiguration },
        );
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
        const blob = await component._runtime.uploadBlob(Buffer.from("some random text"));

        component._root.set("my blob", blob);

        await blobOpP;
    });

    it("blobManager loads from snapshot", async function() {
        const testString = "this is a test string";
        const testString2 = "this is another test string";
        const container1 = await createContainer();

        const summaryP = new Promise((res) => container1.on("op", (op) => {
            if (op.type === "summaryAck") {
                res();
            }
        }));

        const component1 = await requestFluidObject<TestComponent>(container1, "default");

        const blob = await component1._runtime.uploadBlob(Buffer.from(testString)) as BlobHandle;
        component1._root.set("my blob", blob);

        const blob2 = await component1._runtime.uploadBlob(Buffer.from(testString2)) as BlobHandle;
        component1._root.set("my other blob", blob2);

        await summaryP;

        const container2 = await createContainer();
        const component2 = await requestFluidObject<TestComponent>(container2, "default");
        const blob3 = await component2._runtime.getBlob(blob.blobId) as BlobHandle;
        assert.strictEqual(blob.blobId, blob3.blobId);
        assert.strictEqual(await blob.get(), await blob3.get());
        assert.strictEqual(fromBase64ToUtf8(await blob3.get()), testString);

        assert.strictEqual(fromBase64ToUtf8(await component2._root.get("my blob").get()), testString);
        assert.strictEqual(fromBase64ToUtf8(await component2._root.get("my other blob").get()), testString2);
    });
});
