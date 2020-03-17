/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// import * as assert from "assert";
import * as API from "@fluid-internal/client-api";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IProxyLoaderFactory, IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { Loader } from "@microsoft/fluid-container-loader";
import { TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
// import { ConnectionState } from "@microsoft/fluid-protocol-definitions";
import { IDocumentServiceFactory } from "@microsoft/fluid-driver-definitions";

describe("Detached", () => {
    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let testResolver: TestResolver;
    const testRequest: IRequest = { url: "" };
    const pkg: IFluidCodeDetails = {
        package: "@fluid-internal/client-api",
        config: {},
    };
    let codeLoader: API.CodeLoader;
    let loader: Loader;
    let serviceFactory: IDocumentServiceFactory;

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        testResolver = new TestResolver("documentId", testDeltaConnectionServer);
        serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);

        codeLoader = new API.CodeLoader({ generateSummaries: false });
        const options = {};

        loader = new Loader(
            testResolver,
            serviceFactory,
            codeLoader,
            options,
            {},
            new Map<string, IProxyLoaderFactory>(),
        );
    });

    // it("Create detached container", async () => {
    //     const container = await loader.createDetachedContainer(pkg);
    //     assert.equal(container.isAttached(), false, "Container should be detached");
    //     assert.equal(container.closed, false, "Container should be open");
    //     assert.equal(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
    //     assert.equal(container.getQuorum().getMembers().size, 0, "Quorum should not contain any memebers");
    //     assert.equal(container.connectionState, ConnectionState.Disconnected,
    //         "Container should be in disconnected state!!");
    //     assert.equal(container.chaincodePackage.package, pkg.package,
    //         "Package should be same as provided");
    //     assert.equal(container.id, "", "Detached container's id should be empty string");
    // });

    // it("Attach detached container", async () => {
    //     const container = await loader.createDetachedContainer(pkg);
    //     await container.attach(testResolver, testRequest);
    //     assert.equal(container.isAttached(), true, "Container should be attached");
    //     assert.equal(container.closed, false, "Container should be open");
    //     assert.equal(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
    //     assert.equal(container.connectionState, ConnectionState.Disconnected,
    //         "Container should still be in disconnected state!!");
    //     assert.equal(container.id, "documentId", "Doc id is not matching!!");
    // });

    // it("Components in detached container", async () => {
    //     const container = await loader.createDetachedContainer(pkg);
    //     const response = await container.request({ url: "/" });
    //     if (response.mimeType !== "fluid/component" && response.status !== 200) {
    //         assert.fail("Root component should be created in detached container");
    //     }
    //     const component = response.value as API.Document;
    //     const testCompId = "TestComponent1";
    //     await component.runtime.createAndAttachComponent(testCompId, "@fluid-internal/client-api");
    //     const testResponse = await container.request({url: `/${testCompId}`});
    //     if (testResponse.mimeType !== "fluid/component" && testResponse.status !== 200) {
    //         assert.fail("New components should be created in detached container");
    //     }
    //     const testComponent = testResponse.value as API.Document;
    //     assert.equal(testComponent.runtime.isAttached, true, "Component should be attached!!");
    //     const testChannel = await testComponent.runtime.getChannel("root");
    //     assert.equal(testChannel.isRegistered(), true, "Channel should be registered!!");
    //     assert.equal(testChannel.isLocal(), false, "Channel should be registered!!");
    // });

    // it("Components in attached container", async () => {
    //     const container = await loader.createDetachedContainer(pkg);
    //     const response = await container.request({ url: "/" });
    //     const component = response.value as API.Document;
    //     const testCompId = "TestComponent1";
    //     await component.runtime.createAndAttachComponent(testCompId, "@fluid-internal/client-api");

    //     // Now attach the container
    //     await container.attach(testResolver, testRequest);
    //     const testResponse = await container.request({url: `/${testCompId}`});
    //     if (testResponse.mimeType !== "fluid/component" && testResponse.status !== 200) {
    //         assert.fail("New components should be created in detached container");
    //     }
    //     const testComponent = testResponse.value as API.Document;
    //     assert.equal(testComponent.runtime.isAttached, true, "Component should be attached!!");
    //     const testChannel = await testComponent.runtime.getChannel("root");
    //     assert.equal(testChannel.isRegistered(), true, "Channel should be registered!!");
    //     assert.equal(testChannel.isLocal(), false, "Channel should be registered!!");
    // });

    it("Detached", async () => {
        const container = await loader.createDetachedContainer(pkg);
        await container.attach(testResolver, testRequest);
        // const loader2 = new Loader(
        //     testResolver,
        //     serviceFactory,
        //     codeLoader,
        //     {},
        //     {},
        //     new Map<string, IProxyLoaderFactory>(),
        // );
        console.log("aaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        // console.log(container);
        console.log("bbbbbbbbbbb");
        const container2 = await loader.resolve(testRequest);
        console.log(container2);
    });
});
