/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@microsoft/fluid-container-definitions";
import { ConnectionState, Loader } from "@microsoft/fluid-container-loader";
import { IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import {
    LocalCodeLoader,
    ITestFluidComponent,
    TestFluidComponentFactory,
} from "@microsoft/fluid-test-utils";
import { v4 as uuid } from "uuid";

describe("Detached Container", () => {
    const documentId = "detachedContainerTest";
    const pkg: IFluidCodeDetails = {
        package: "detachedContainerTestPackage",
        config: {},
    };

    let request: IRequest;
    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let loader: Loader;

    const createAndAttachComponent = (async (
        componentContext: IComponentContext,
        componentId: string,
        type: string,
    ) => {
        const doc = await componentContext.createComponent(componentId, type);
        doc.attach();
    });

    function createTestLoader(urlResolver: IUrlResolver): Loader {
        const factory: TestFluidComponentFactory = new TestFluidComponentFactory([]);
        const codeLoader = new LocalCodeLoader([[ pkg, factory ]]);
        const documentServiceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
        return new Loader(
            urlResolver,
            documentServiceFactory,
            codeLoader,
            {},
            {},
            new Map<string, IProxyLoaderFactory>());
    }

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        const urlResolver = new TestResolver();
        request = urlResolver.createCreateNewRequest(documentId);
        loader = createTestLoader(urlResolver);
    });

    it("Create detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        assert.strictEqual(container.isLocal(), true, "Container should be detached");
        assert.strictEqual(container.closed, false, "Container should be open");
        assert.strictEqual(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
        assert.strictEqual(container.getQuorum().getMembers().size, 0, "Quorum should not contain any memebers");
        assert.strictEqual(container.connectionState, ConnectionState.Disconnected,
            "Container should be in disconnected state!!");
        assert.strictEqual(container.chaincodePackage.package, pkg.package,
            "Package should be same as provided");
        assert.strictEqual(container.id, "", "Detached container's id should be empty string");
        assert.strictEqual(container.clientDetails.capabilities.interactive, true,
            "Client details should be set with interactive as true");
    });

    it("Attach detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        await container.attach(request);
        assert.strictEqual(container.isLocal(), false, "Container should be attached");
        assert.strictEqual(container.closed, false, "Container should be open");
        assert.strictEqual(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
        assert.strictEqual(container.id, documentId, "Doc id is not matching!!");
    });

    it("Components in detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        if (response.mimeType !== "fluid/component" && response.status !== 200) {
            assert.fail("Root component should be created in detached container");
        }
        const component = response.value as ITestFluidComponent;

        // Create a sub component of type TestFluidComponent and verify that it is attached.
        const subCompId = uuid();
        await createAndAttachComponent(component.context, subCompId, "default");
        const subResponse = await container.request({ url: `/${subCompId}` });
        if (subResponse.mimeType !== "fluid/component" && subResponse.status !== 200) {
            assert.fail("New components should be created in detached container");
        }
        const subComponent = subResponse.value as ITestFluidComponent;
        assert.strictEqual(subComponent.context.storage, undefined, "No storage should be there!!");
        assert.strictEqual(subComponent.runtime.isAttached, true, "Component should be attached!!");

        // Get the sub component's root channel and verify that it is attached.
        const testChannel = await subComponent.runtime.getChannel("root");
        assert.strictEqual(testChannel.isRegistered(), true, "Channel should be registered!!");
        assert.strictEqual(testChannel.isLocal(), true, "Channel should be local!!");
        assert.strictEqual(subComponent.context.isLocal(), true, "Component should be local!!");
    });

    it("Components in attached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;

        // Create a sub component of type TestFluidComponent.
        const newComponentId = uuid();
        await createAndAttachComponent(component.context, newComponentId, "default");

        // Now attach the container
        await container.attach(request);

        // Get the sub component and verify that it is attached.
        const testResponse = await container.request({ url: `/${newComponentId}` });
        if (testResponse.mimeType !== "fluid/component" && testResponse.status !== 200) {
            assert.fail("New components should be created in detached container");
        }
        const testComponent = testResponse.value as ITestFluidComponent;
        assert.strictEqual(testComponent.runtime.isAttached, true, "Component should be attached!!");

        // Get the sub component's "root" channel and verify that it is attached.
        const testChannel = await testComponent.runtime.getChannel("root");
        assert.strictEqual(testChannel.isRegistered(), true, "Channel should be registered!!");
        assert.strictEqual(testChannel.isLocal(), false, "Channel should not be local!!");

        assert.strictEqual(testComponent.context.isLocal(), false, "Component should not be local!!");
    });

    it("Load attached container and check for components", async () => {
        const container = await loader.createDetachedContainer(pkg);
        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidComponent;

        // Create a sub component of type TestFluidComponent.
        const subCompId = uuid();
        await createAndAttachComponent(component.context, subCompId, "default");

        // Now attach the container and get the sub component.
        await container.attach(request);
        const response1 = await container.request({ url: `/${subCompId}` });
        const subComponent1 = response1.value as ITestFluidComponent;

        // Now load the container from another loader.
        const urlResolver2 = new TestResolver();
        const loader2 = createTestLoader(urlResolver2);
        // Create a new request url from the resolvedUrl of the first container.
        const requestUrl2 = await urlResolver2.requestUrl(container.resolvedUrl, { url : "" });
        const container2 = await loader2.resolve({ url: requestUrl2.value });

        // Get the sub component and assert that it is attached.
        const response2 = await container2.request({ url: `/${subCompId}` });
        const subComponent2 = response2.value as ITestFluidComponent;
        assert.strictEqual(subComponent2.runtime.isAttached, true, "Component should be attached!!");

        // Verify the attributes of the root channel of both sub components.
        const testChannel1 = await subComponent1.runtime.getChannel("root");
        const testChannel2 = await subComponent2.runtime.getChannel("root");
        assert.strictEqual(testChannel2.isRegistered(), true, "Channel should be registered!!");
        assert.strictEqual(testChannel2.isLocal(), false, "Channel should be registered!!");
        assert.strictEqual(testChannel2.isRegistered(), testChannel1.isRegistered(),
            "Value for registration should be same!!");
        assert.strictEqual(testChannel2.isLocal(), testChannel1.isLocal(), "Value for isLocal should persist!!");
    });
});
