/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@microsoft/fluid-container-definitions";
import { Loader } from "@microsoft/fluid-container-loader";
import  { IContainerRuntime } from "@microsoft/fluid-container-runtime-definitions";
import { IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import {
    LocalCodeLoader,
    ITestFluidComponent,
    TestFluidComponentFactory,
} from "@microsoft/fluid-test-utils";
import { SharedObject } from "@microsoft/fluid-shared-object-base";
import { IContainerRuntimeBase } from "@microsoft/fluid-runtime-definitions";
import { SharedMap } from "@microsoft/fluid-map";

describe("DDS Detached Container", () => {
    const documentId = "detachedContainerTest";
    const pkg: IFluidCodeDetails = {
        package: "detachedContainerTestPackage",
        config: {},
    };

    let request: IRequest;
    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let loader: Loader;

    const createDetachedContainerAndGetRootComponent = async () => {
        const container = await loader.createDetachedContainer(pkg);
        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component1 = response.value as ITestFluidComponent;
        return {
            container,
            component1,
        };
    };

    const createComponent = async (
        containerRuntime: IContainerRuntimeBase,
    ) => {
        const component2RuntimeChannel = await (containerRuntime as IContainerRuntime)
            .createComponentWithRealizationFn(["default"]);
        const component2 = (await component2RuntimeChannel.request({ url: "/" })).value as ITestFluidComponent;
        return {
            component2,
            component2RuntimeChannel,
        };
    };

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

    it("Attaching component should not attach unregistered DDS: Local contianer", async () => {
        const { component1 } = await createDetachedContainerAndGetRootComponent();

        // Create another component which returns the runtime channel.
        const { component2, component2RuntimeChannel } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        component2RuntimeChannel.attach();

        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
        assert.strictEqual(component2.runtime.isAttached, true, "Component2 should be attached");

        assert.strictEqual(channel.isRegistered(), false, "Channel should not be registered as it was not registered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should not be attached as it was not registered");
    });

    it("Attaching component should attach registered DDS: Local contianer", async () => {
        const { component1 } = await createDetachedContainerAndGetRootComponent();

        // Create another component which returns the runtime channel.
        const { component2, component2RuntimeChannel } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        // Now register the channel
        (await channel.handle.get() as SharedObject).register();
        assert.strictEqual(channel.isRegistered(), true, "Channel should be registered");
        component2RuntimeChannel.attach();

        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
        assert.strictEqual(component2.runtime.isAttached, true, "Component2 should be attached");

        // Channel should get attached as it was registered to its component
        assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");
    });

    it.skip("Attaching DDS should attach component: Local contianer", async () => {
        const { component1 } = await createDetachedContainerAndGetRootComponent();

        // Create another component which returns the runtime channel.
        const { component2 } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        // Now register the channel
        (await channel.handle.get() as SharedObject).register();
        assert.strictEqual(channel.isRegistered(), true, "Channel should be registered");

        channel.handle.attach();
        // Channel should get attached as it was registered to its component
        assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");

        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
        assert.strictEqual(component2.runtime.isAttached, true, "Component2 should be attached");
    });

    it("Sticking handle in attached dds should attach the DDS: Local contianer", async () => {
        const { component1 } = await createDetachedContainerAndGetRootComponent();

        // Create another component which returns the runtime channel.
        const { component2, component2RuntimeChannel } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        component2RuntimeChannel.attach();

        const rootOfComponent2 = await component2.runtime.getChannel("root") as SharedMap;
        const testChannelOfComponent2 = await component2.runtime.getChannel("test1");

        assert.strictEqual(rootOfComponent2.handle.isAttached, true,
            "Root Channel should get attached as it was registered");
        assert.strictEqual(testChannelOfComponent2.handle.isAttached, false, "Test Channel should not be attached ");
        rootOfComponent2.set("test1handle", channel.handle);

        assert.strictEqual(testChannelOfComponent2.handle.isAttached, true,
            "Test Channel should be attached now after sticking it in attached dds");
    });

    it("Registering DDS in attached component should attach it: Local contianer", async () => {
        const { component1 } = await createDetachedContainerAndGetRootComponent();

        // Create another component which returns the runtime channel.
        const { component2, component2RuntimeChannel } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        component2RuntimeChannel.attach();

        (await channel.handle.get() as SharedObject).register();
        assert.strictEqual(channel.isRegistered(), true, "Channel should be registered");
        assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");
    });

    it("Registering DDS in detached component should not attach it: Local contianer", async () => {
        const { component1 } = await createDetachedContainerAndGetRootComponent();

        // Create another component which returns the runtime channel.
        const { component2 } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        (await channel.handle.get() as SharedObject).register();
        assert.strictEqual(channel.isRegistered(), true, "Channel should be registered");
        assert.strictEqual(channel.handle.isAttached, false,
            "Channel should not get attached on registering it to unattached component");
    });

    it.skip("Stick handle of 2 dds in each other and then attaching component should attach both DDS: Local contianer",
        async () => {
            const { component1 } = await createDetachedContainerAndGetRootComponent();

            // Create another component which returns the runtime channel.
            const { component2, component2RuntimeChannel } =
                await createComponent(component1.context.containerRuntime);
            assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
            assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

            // Create first channel
            const channel1 = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel1.isRegistered(), false, "Channel should be unregistered");
            assert.strictEqual(channel1.handle.isAttached, false, "Channel should be detached");

            // Create second channel
            const channel2 = component2.runtime.createChannel("test2", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel2.isRegistered(), false, "Channel should be unregistered");
            assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

            // Now register both dds to parent component
            (await channel1.handle.get() as SharedObject).register();
            (await channel2.handle.get() as SharedObject).register();

            const testChannel1OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;
            const testChannel2OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;

            testChannel1OfComponent2.set("test2handle", channel2.handle);
            testChannel2OfComponent2.set("test1handle", channel1.handle);

            // Now attach the component2. Currently this will end up in infinite loop.
            component2RuntimeChannel.attach();
            assert.strictEqual(testChannel1OfComponent2.handle.isAttached, true,
                "Test Channel 1 should be attached now after attaching parent component");
            assert.strictEqual(testChannel2OfComponent2.handle.isAttached, true,
                "Test Channel 2 should be attached now after attaching parent component");
        });

    it.skip("Stick handle of 2 dds in each other and then attaching 1 DDS should attach other DDS: Local contianer",
        async () => {
            const { component1 } = await createDetachedContainerAndGetRootComponent();

            // Create another component which returns the runtime channel.
            const { component2 } = await createComponent(component1.context.containerRuntime);
            assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
            assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

            // Create first channel
            const channel1 = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel1.isRegistered(), false, "Channel should be unregistered");
            assert.strictEqual(channel1.handle.isAttached, false, "Channel should be detached");

            // Create second channel
            const channel2 = component2.runtime.createChannel("test2", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel2.isRegistered(), false, "Channel should be unregistered");
            assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

            // Now register both dds to parent component
            (await channel1.handle.get() as SharedObject).register();
            (await channel2.handle.get() as SharedObject).register();

            const testChannel1OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;
            const testChannel2OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;

            testChannel1OfComponent2.set("test2handle", channel2.handle);
            testChannel2OfComponent2.set("test1handle", channel1.handle);

            // Currently it will go in infinite loop.
            channel1.handle.attach();
            assert.strictEqual(testChannel1OfComponent2.handle.isAttached, true,
                "Test Channel 1 should be attached now after attaching parent component");
            assert.strictEqual(testChannel2OfComponent2.handle.isAttached, true,
                "Test Channel 2 should be attached now after attaching parent component");
        });

    // Live Contianer Tests
    it("Attaching component should not attach unregistered DDS: Live contianer", async () => {
        const { container, component1 } = await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const { component2, component2RuntimeChannel } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local because it is not attached");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        component2RuntimeChannel.attach();

        assert.strictEqual(component2.runtime.isLocal(),
            false, "Component2 should be live because it is attached and contianer is live");
        assert.strictEqual(component2.runtime.isAttached, true, "Component2 should be attached");

        assert.strictEqual(channel.isRegistered(), false, "Channel should not be registered as it was not registered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should not be attached as it was not registered");
    });

    it("Attaching component should attach registered DDS: Live contianer", async () => {
        const { container, component1 } = await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const { component2, component2RuntimeChannel } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local because it is not attached");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        // Now register the channel
        (await channel.handle.get() as SharedObject).register();
        assert.strictEqual(channel.isRegistered(), true, "Channel should be registered");
        component2RuntimeChannel.attach();

        assert.strictEqual(component2.runtime.isLocal(),
            false, "Component2 should be live because it is attached and contianer is live");
        assert.strictEqual(component2.runtime.isAttached, true, "Component2 should be attached");

        // Channel should get attached as it was registered to its component
        assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");
    });

    it.skip("Attaching DDS should attach component: Live contianer", async () => {
        const { container, component1 } = await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const { component2 } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true,
            "Component2 should be local because it is not attached");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        // Now register the channel
        (await channel.handle.get() as SharedObject).register();
        assert.strictEqual(channel.isRegistered(), true, "Channel should be registered");

        channel.handle.attach();
        // Channel should get attached as it was registered to its component
        assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");

        assert.strictEqual(component2.runtime.isLocal(), false, "Component2 should be live now");
        assert.strictEqual(component2.runtime.isAttached, true, "Component2 should be attached");
    });

    it("Sticking handle in attached dds should attach the DDS: Live contianer", async () => {
        const { container, component1 } = await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const { component2, component2RuntimeChannel } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local because it is not attached");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        component2RuntimeChannel.attach();

        const rootOfComponent2 = await component2.runtime.getChannel("root") as SharedMap;
        const testChannelOfComponent2 = await component2.runtime.getChannel("test1");

        assert.strictEqual(rootOfComponent2.handle.isAttached, true,
            "Root Channel should get attached as it was registered");
        assert.strictEqual(testChannelOfComponent2.handle.isAttached, false, "Test Channel should not be attached ");
        rootOfComponent2.set("test1handle", channel.handle);

        assert.strictEqual(testChannelOfComponent2.handle.isAttached, true,
            "Test Channel should be attached now after sticking it in attached dds");
    });

    it("Registering DDS in attached component should attach it: Live contianer", async () => {
        const { container, component1 } = await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const { component2, component2RuntimeChannel } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local because it is not attached");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        component2RuntimeChannel.attach();

        (await channel.handle.get() as SharedObject).register();
        assert.strictEqual(channel.isRegistered(), true, "Channel should be registered");
        assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");
    });

    it("Registering DDS in detached component should not attach it: Live contianer", async () => {
        const { container, component1 } = await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const { component2 } = await createComponent(component1.context.containerRuntime);
        assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local because it is not attached");
        assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        (await channel.handle.get() as SharedObject).register();
        assert.strictEqual(channel.isRegistered(), true, "Channel should be registered");
        assert.strictEqual(channel.handle.isAttached, false,
            "Channel should not get attached on registering it to unattached component");
    });

    it.skip("Stick handle of 2 dds in each other and then attaching component should attach both DDS: Live contianer",
        async () => {
            const { container, component1 } = await createDetachedContainerAndGetRootComponent();
            await container.attach(request);

            // Create another component which returns the runtime channel.
            const { component2, component2RuntimeChannel } =
                await createComponent(component1.context.containerRuntime);
            assert.strictEqual(component2.runtime.isLocal(),
                true, "Component2 should be local because it is not attached");
            assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

            // Create first channel
            const channel1 = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel1.isRegistered(), false, "Channel should be unregistered");
            assert.strictEqual(channel1.handle.isAttached, false, "Channel should be detached");

            // Create second channel
            const channel2 = component2.runtime.createChannel("test2", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel2.isRegistered(), false, "Channel should be unregistered");
            assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

            // Now register both dds to parent component
            (await channel1.handle.get() as SharedObject).register();
            (await channel2.handle.get() as SharedObject).register();

            const testChannel1OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;
            const testChannel2OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;

            testChannel1OfComponent2.set("test2handle", channel2.handle);
            testChannel2OfComponent2.set("test1handle", channel1.handle);

            // Now attach the component2. Currently this will end up in infinite loop.
            component2RuntimeChannel.attach();
            assert.strictEqual(testChannel1OfComponent2.handle.isAttached, true,
                "Test Channel 1 should be attached now after attaching parent component");
            assert.strictEqual(testChannel2OfComponent2.handle.isAttached, true,
                "Test Channel 2 should be attached now after attaching parent component");
        });

    it.skip("Stick handle of 2 dds in each other and then attaching 1 DDS should attach other DDS: Live contianer",
        async () => {
            const { container, component1 } = await createDetachedContainerAndGetRootComponent();
            await container.attach(request);

            // Create another component which returns the runtime channel.
            const { component2 } = await createComponent(component1.context.containerRuntime);
            assert.strictEqual(component2.runtime.isLocal(), true, "Component2 should be local");
            assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

            // Create first channel
            const channel1 = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel1.isRegistered(), false, "Channel should be unregistered");
            assert.strictEqual(channel1.handle.isAttached, false, "Channel should be detached");

            // Create second channel
            const channel2 = component2.runtime.createChannel("test2", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel2.isRegistered(), false, "Channel should be unregistered");
            assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

            // Now register both dds to parent component
            (await channel1.handle.get() as SharedObject).register();
            (await channel2.handle.get() as SharedObject).register();

            const testChannel1OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;
            const testChannel2OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;

            testChannel1OfComponent2.set("test2handle", channel2.handle);
            testChannel2OfComponent2.set("test1handle", channel1.handle);

            // Currently it will go in infinite loop.
            channel1.handle.attach();
            assert.strictEqual(testChannel1OfComponent2.handle.isAttached, true,
                "Test Channel 1 should be attached now after attaching parent component");
            assert.strictEqual(testChannel2OfComponent2.handle.isAttached, true,
                "Test Channel 2 should be attached now after attaching parent component");
        });
});
