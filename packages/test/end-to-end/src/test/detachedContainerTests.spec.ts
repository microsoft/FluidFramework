/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { Loader } from "@microsoft/fluid-container-loader";
import { ConnectionState } from "@microsoft/fluid-protocol-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import {
    createLocalLoader,
    ITestFluidComponent,
    TestFluidComponentFactory,
} from "@microsoft/fluid-test-utils";
import { TestResolver } from "@microsoft/fluid-local-driver";
import {
    IComponentContext,
    IExperimentalComponentContext,
    IExperimentalContainerRuntime,
} from "@microsoft/fluid-runtime-definitions";
import { v4 as uuid } from "uuid";

describe("Detached Container", () => {
    const documentId = "detachedContainerTest";
    let testResolver: TestResolver;
    let testRequest: IRequest;
    const pkg: IFluidCodeDetails = {
        package: "detachedContainerTestPackage",
        config: {},
    };

    let factory: TestFluidComponentFactory;
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

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        testResolver = new TestResolver();
        testRequest = testResolver.createCreateNewRequest(documentId);
        factory = new TestFluidComponentFactory([]);
        loader = createLocalLoader([[ pkg, factory ]], testDeltaConnectionServer) as Loader;
    });

    it("Create detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        assert.equal(container.isLocal(), true, "Container should be detached");
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
        assert.equal(container.isLocal(), false, "Container should be attached");
        assert.equal(container.closed, false, "Container should be open");
        assert.equal(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
        assert.equal(container.id, documentId, "Doc id is not matching!!");
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
        assert.equal(subComponent.context.storage, undefined, "No storage should be there!!");
        assert.equal(subComponent.runtime.isAttached, true, "Component should be attached!!");

        // Get the sub component's root channel and verify that it is attached.
        const testChannel = await subComponent.runtime.getChannel("root");
        assert.equal(testChannel.isRegistered(), true, "Channel should be registered!!");
        assert.equal(testChannel.isLocal(), true, "Channel should be local!!");
        const expComponentContext = subComponent.context as IExperimentalComponentContext;
        assert(expComponentContext?.isExperimentalComponentContext);
        assert.equal(expComponentContext.isLocal(), true, "Component should be local!!");

        const expContainerRuntime = subComponent.context.containerRuntime as IExperimentalContainerRuntime;
        assert(expContainerRuntime?.isExperimentalContainerRuntime);
        assert.equal(expContainerRuntime.isLocal(), true, "Container should be local!!");
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
        await container.attach(testRequest);

        // Get the sub component and verify that it is attached.
        const testResponse = await container.request({ url: `/${newComponentId}` });
        if (testResponse.mimeType !== "fluid/component" && testResponse.status !== 200) {
            assert.fail("New components should be created in detached container");
        }
        const testComponent = testResponse.value as ITestFluidComponent;
        assert.equal(testComponent.runtime.isAttached, true, "Component should be attached!!");

        // Get the sub component's "root" channel and verify that it is attached.
        const testChannel = await testComponent.runtime.getChannel("root");
        assert.equal(testChannel.isRegistered(), true, "Channel should be registered!!");
        assert.equal(testChannel.isLocal(), false, "Channel should not be local!!");
        const expComponentContext = testComponent.context as IExperimentalComponentContext;
        assert(expComponentContext?.isExperimentalComponentContext);
        assert.equal(expComponentContext.isLocal(), false, "Component should not be local!!");
        const expContainerRuntime = testComponent.context.containerRuntime as IExperimentalContainerRuntime;
        assert(expContainerRuntime?.isExperimentalContainerRuntime);
        assert.equal(expContainerRuntime.isLocal(), false, "Container should be attached!!");
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
        await container.attach(testRequest);
        const response1 = await container.request({ url: `/${subCompId}` });
        const subComponent1 = response1.value as ITestFluidComponent;

        // Now load the container from another loader.
        const loader2 = createLocalLoader([[ pkg, factory ]], testDeltaConnectionServer) as Loader;
        const container2 = await loader2.resolve(testRequest);

        // Get the sub component and assert that it is attached.
        const response2 = await container2.request({ url: `/${subCompId}` });
        const subComponent2 = response2.value as ITestFluidComponent;
        assert.equal(subComponent2.runtime.isAttached, true, "Component should be attached!!");

        // Verify the attributes of the root channel of both sub components.
        const testChannel1 = await subComponent1.runtime.getChannel("root");
        const testChannel2 = await subComponent2.runtime.getChannel("root");
        assert.equal(testChannel2.isRegistered(), true, "Channel should be registered!!");
        assert.equal(testChannel2.isLocal(), false, "Channel should be registered!!");
        assert.equal(testChannel2.isRegistered(), testChannel1.isRegistered(),
            "Value for registration should be same!!");
        assert.equal(testChannel2.isLocal(), testChannel1.isLocal(), "Value for isLocal should persist!!");
    });
});
