/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as API from "@fluid-internal/client-api";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IProxyLoaderFactory, IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { Loader } from "@microsoft/fluid-container-loader";
import { TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { ConnectionState } from "@microsoft/fluid-protocol-definitions";
import { IDocumentServiceFactory } from "@microsoft/fluid-driver-definitions";
import { IExperimentalComponentContext } from "@microsoft/fluid-runtime-definitions";

describe("Detached Container", () => {
    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let testResolver: TestResolver;
    let testRequest: IRequest;
    const pkg: IFluidCodeDetails = {
        package: "@fluid-internal/client-api",
        config: {},
    };
    let codeLoader: API.CodeLoader;
    let loader: Loader;
    let serviceFactory: IDocumentServiceFactory;

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        testResolver = new TestResolver();
        testRequest = testResolver.createCreateNewRequest();
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

    it("Create detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        assert.equal(container.isContainerAttached(), false, "Container should be detached");
        assert.equal(container.closed, false, "Container should be open");
        assert.equal(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
        assert.equal(container.getQuorum().getMembers().size, 0, "Quorum should not contain any memebers");
        assert.equal(container.connectionState, ConnectionState.Disconnected,
            "Container should be in disconnected state!!");
        assert.equal(container.chaincodePackage.package, pkg.package,
            "Package should be same as provided");
        assert.equal(container.id, "", "Detached container's id should be empty string");
    });

    it("Attach detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        await container.attach(testRequest);
        assert.equal(container.isContainerAttached(), true, "Container should be attached");
        assert.equal(container.closed, false, "Container should be open");
        assert.equal(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
        assert.equal(container.id, "documentId", "Doc id is not matching!!");
    });

    it("Components in detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        const response = await container.request({ url: "/" });
        if (response.mimeType !== "fluid/component" && response.status !== 200) {
            assert.fail("Root component should be created in detached container");
        }
        const component = response.value as API.Document;
        const testCompId = "TestComponent1";
        await component.runtime.createAndAttachComponent(testCompId, "@fluid-internal/client-api");
        const testResponse = await container.request({url: `/${testCompId}`});
        if (testResponse.mimeType !== "fluid/component" && testResponse.status !== 200) {
            assert.fail("New components should be created in detached container");
        }
        const testComponent = testResponse.value as API.Document;
        assert.equal(testComponent.context.storageGetter(), undefined, "No storage should be there!!");
        assert.equal(testComponent.runtime.isAttached, true, "Component should be attached!!");
        const testChannel = await testComponent.runtime.getChannel("root");
        assert.equal(testChannel.isRegistered(), true, "Channel should be registered!!");
        assert.equal(testChannel.isLocal(), true, "Channel should be local!!");
        const expComponentContext = testComponent.context as IExperimentalComponentContext;
        assert(expComponentContext?.isExperimentalComponentContext);
        assert.equal(expComponentContext.isContainerAttached(), false, "Container should not be attached!!");
    });

    it("Components in attached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        const response = await container.request({ url: "/" });
        const component = response.value as API.Document;
        const testCompId = "TestComponent1";
        await component.runtime.createAndAttachComponent(testCompId, "@fluid-internal/client-api");

        // Now attach the container
        await container.attach(testRequest);
        const testResponse = await container.request({url: `/${testCompId}`});
        if (testResponse.mimeType !== "fluid/component" && testResponse.status !== 200) {
            assert.fail("New components should be created in detached container");
        }
        const testComponent = testResponse.value as API.Document;
        assert(testComponent.context.storageGetter(), "Storage should exist now!!");
        assert.equal(testComponent.runtime.isAttached, true, "Component should be attached!!");
        const testChannel = await testComponent.runtime.getChannel("root");
        assert.equal(testChannel.isRegistered(), true, "Channel should be registered!!");
        assert.equal(testChannel.isLocal(), false, "Channel should not be local!!");
        const expComponentContext = testComponent.context as IExperimentalComponentContext;
        assert(expComponentContext?.isExperimentalComponentContext);
        assert.equal(expComponentContext.isContainerAttached(), true, "Container should be attached!!");
    });

    it("Load attached container and check for components", async () => {
        const container = await loader.createDetachedContainer(pkg);
        const response = await container.request({ url: "/" });
        const component = response.value as API.Document;
        const testCompId = "TestComponent1";
        await component.runtime.createAndAttachComponent(testCompId, "@fluid-internal/client-api");

        // Now attach the container
        await container.attach(testRequest);
        const response1 = await container.request({ url: `/${testCompId}` });
        const testComponent1 = response1.value as API.Document;
        // Now load the container from another loader
        const loader2 = new Loader(
            testResolver,
            serviceFactory,
            codeLoader,
            {},
            {},
            new Map<string, IProxyLoaderFactory>(),
        );
        const container2 = await loader2.resolve({url:
            (await testResolver.requestUrl(container.resolvedUrl, {url : ""})).value});
        const response2 = await container2.request({ url: `/${testCompId}` });
        const testComponent2 = response2.value as API.Document;
        assert.equal(testComponent2.runtime.isAttached, true, "Component should be attached!!");
        const testChannel1 = await testComponent1.runtime.getChannel("root");
        const testChannel2 = await testComponent2.runtime.getChannel("root");
        assert.equal(testChannel2.isRegistered(), true, "Channel should be registered!!");
        assert.equal(testChannel2.isLocal(), false, "Channel should be registered!!");
        assert.equal(testChannel2.isRegistered(), testChannel1.isRegistered(),
            "Value for registration should be same!!");
        assert.equal(testChannel2.isLocal(), testChannel1.isLocal(), "Value for isLocal should persist!!");
    });
});
