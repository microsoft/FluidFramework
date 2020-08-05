/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IRequest } from "@fluidframework/core-interfaces";
import {
    IFluidCodeDetails,
    IProxyLoaderFactory,
    AttachState,
    DetachedContainerSource,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    LocalCodeLoader,
    ITestFluidComponent,
    TestFluidComponentFactory,
    TestFluidComponent,
} from "@fluidframework/test-utils";
import { SharedObject } from "@fluidframework/shared-object-base";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";

describe(`Attach/Bind Api Tests For Attached Container`, () => {
    const documentId = "detachedContainerTest";
    const codeDetails: IFluidCodeDetails = {
        package: "detachedContainerTestPackage1",
        config: {},
    };
    const source: DetachedContainerSource = {
        codeDetails,
        useSnapshot: false,
    };
    const mapId1 = "mapId1";
    const mapId2 = "mapId2";

    let request: IRequest;
    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let loader: Loader;

    const createTestStatementForAttachedDetached = (name: string, attached: boolean) =>
        `${name} should be ${attached ? "Attached" : "Detached"}`;

    async function createDetachedContainerAndGetRootComponent() {
        const container = await loader.createDetachedContainer(source);
        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const defaultComponent = response.value;
        return {
            container,
            defaultComponent,
        };
    }

    const createPeerComponent = async (
        containerRuntime: IContainerRuntimeBase,
    ) => {
        const router = await containerRuntime.createDataStore(["default"]);
        const peerComponent = await requestFluidObject<ITestFluidComponent>(router, "/");
        return {
            peerComponent,
            peerComponentRuntimeChannel: peerComponent.channel,
        };
    };

    function createTestLoader(urlResolver: IUrlResolver): Loader {
        const factory: TestFluidComponentFactory = new TestFluidComponentFactory([
            [mapId1, SharedMap.getFactory()],
            [mapId2, SharedMap.getFactory()],
        ]);
        const codeLoader = new LocalCodeLoader([[codeDetails, factory]]);
        const documentServiceFactory = new LocalDocumentServiceFactory(testDeltaConnectionServer);
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
        const urlResolver = new LocalResolver();
        request = urlResolver.createCreateNewRequest(documentId);
        loader = createTestLoader(urlResolver);
    });

    it("Attaching component should not attach unregistered DDS", async () => {
        const { container, defaultComponent } =
            await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
        const component2 = peerComponent.peerComponent;
        const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;

        assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
            createTestStatementForAttachedDetached("Component2", false));

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        component2RuntimeChannel.bindToContext();

        assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, true,
            createTestStatementForAttachedDetached("Component2", true));

        assert.strictEqual(channel.handle.isAttached, false,
            "Channel should not be attached as it was not registered");
    });

    it("Attaching component should attach registered DDS", async () => {
        const { container, defaultComponent } =
            await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
        const component2 = peerComponent.peerComponent;
        const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;
        assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
            createTestStatementForAttachedDetached("Component2", false));

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        // Now register the channel
        (await channel.handle.get() as SharedObject).bindToContext();
        component2RuntimeChannel.bindToContext();

        assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, true,
            createTestStatementForAttachedDetached("Component2", true));

        // Channel should get attached as it was registered to its component
        assert.strictEqual(channel.handle.isAttached, true,
            createTestStatementForAttachedDetached("Channel", true));
    });

    it("Attaching DDS should attach component", async () => {
        const { container, defaultComponent } =
            await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
        const component2 = peerComponent.peerComponent;
        assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
            createTestStatementForAttachedDetached("Component2", false));

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        channel.handle.attachGraph();

        // Channel should get attached as it was registered to its component
        assert.strictEqual(channel.handle.isAttached, true,
            createTestStatementForAttachedDetached("Channel", true));

        assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, true,
            createTestStatementForAttachedDetached("Component2", true));
    });

    it("Sticking handle in attached dds should attach the DDS in attached container", async () => {
        const { container, defaultComponent } =
            await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
        const component2 = peerComponent.peerComponent;
        const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;
        assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
            createTestStatementForAttachedDetached("Component2", false));

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        component2RuntimeChannel.bindToContext();

        const rootOfComponent2 = await component2.runtime.getChannel("root") as SharedMap;
        const testChannelOfComponent2 = await component2.runtime.getChannel("test1");

        assert.strictEqual(rootOfComponent2.isAttached(), true,
            "Root Channel should be attached");
        assert.strictEqual(testChannelOfComponent2.isAttached(), false,
            "Test Channel should not be attached");
        rootOfComponent2.set("test1handle", channel.handle);

        assert.strictEqual(testChannelOfComponent2.isAttached(), true,
            "Test Channel should be bound only in attached container after sticking it in bounded dds");
    });

    it("Registering DDS in attached component should attach it", async () => {
        const { container, defaultComponent } =
            await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
        const component2 = peerComponent.peerComponent;
        const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;

        assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
            createTestStatementForAttachedDetached("Component2", false));

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        component2RuntimeChannel.bindToContext();

        (await channel.handle.get() as SharedObject).bindToContext();
        assert.strictEqual(channel.handle.isAttached, true,
            createTestStatementForAttachedDetached("Channel", true));
    });

    it("Registering DDS in detached component should not attach it", async () => {
        const { container, defaultComponent } =
            await createDetachedContainerAndGetRootComponent();
        await container.attach(request);

        // Create another component which returns the runtime channel.
        const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
        const component2 = peerComponent.peerComponent;

        assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
            createTestStatementForAttachedDetached("Component2", false));
        assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
            "Component2 should be unattached");

        // Create a channel
        const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
        assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

        (await channel.handle.get() as SharedObject).bindToContext();
        assert.strictEqual(channel.handle.isAttached, false,
            "Channel should not get attached on registering it to unattached component");
    });

    it("Stick handle of 2 dds in each other and then attaching component should attach both DDS",
        async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent();
            await container.attach(request);

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;
            const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;

            assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
                createTestStatementForAttachedDetached("Component2", false));
            assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
                "Component2 should be unattached");

            // Create first channel
            const channel1 = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel1.handle.isAttached, false, "Channel should be detached");

            // Create second channel
            const channel2 = component2.runtime.createChannel("test2", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

            // Now register both dds to parent component
            (await channel1.handle.get() as SharedObject).bindToContext();
            (await channel2.handle.get() as SharedObject).bindToContext();

            const testChannel1OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;
            const testChannel2OfComponent2 = await component2.runtime.getChannel("test2") as SharedMap;

            testChannel1OfComponent2.set("test2handle", channel2.handle);
            testChannel2OfComponent2.set("test1handle", channel1.handle);

            // Now attach the component2. Currently this will end up in infinite loop.
            component2RuntimeChannel.bindToContext();
            assert.strictEqual(testChannel1OfComponent2.handle.isAttached, true,
                createTestStatementForAttachedDetached("Test Channel 1", true));
            assert.strictEqual(testChannel2OfComponent2.handle.isAttached, true,
                createTestStatementForAttachedDetached("Test Channel 1", true));
        });

    it("Stick handle of 2 dds in each other and then attaching 1 DDS should attach other DDS",
        async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent();
            await container.attach(request);

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;

            assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
                createTestStatementForAttachedDetached("Component2", false));
            assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
                "Component2 should be unattached");

            // Create first channel
            const channel1 = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel1.handle.isAttached, false, "Channel should be detached");

            // Create second channel
            const channel2 = component2.runtime.createChannel("test2", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

            // Now register both dds to parent component
            (await channel1.handle.get() as SharedObject).bindToContext();
            (await channel2.handle.get() as SharedObject).bindToContext();

            const testChannel1OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;
            const testChannel2OfComponent2 = await component2.runtime.getChannel("test2") as SharedMap;

            testChannel1OfComponent2.set("test2handle", channel2.handle);
            testChannel2OfComponent2.set("test1handle", channel1.handle);

            channel1.handle.attachGraph();
            assert.strictEqual(testChannel1OfComponent2.isAttached(), true,
                "Test Channel 1 should be bound now after attaching graph it");
            assert.strictEqual(testChannel2OfComponent2.isAttached(), true,
                "Test Channel 2 should be bound now after attaching other DDS");
        });

    it("Stick handle of 2 dds(of 2 different components) in each other and then attaching 1 DDS should " +
        "attach other DDS and component with correct recursion",
        async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent();
            await container.attach(request);

            // Create another component which returns the runtime channel.
            const peerComponent1 = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent1.peerComponent;
            assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
                createTestStatementForAttachedDetached("Component2", false));
            assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
                "Component2 should be unattached");

            // Create another component which returns the runtime channel.
            const peerComponent2 = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component3 = peerComponent2.peerComponent;
            assert.strictEqual(component3.runtime.IFluidHandleContext.isAttached, false,
                createTestStatementForAttachedDetached("Component2", false));

            // Create first channel from component2
            const channel2 = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

            // Create second channel from component 3
            const channel3 = component3.runtime.createChannel("test2", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel3.handle.isAttached, false, "Channel should be detached");

            const testChannelOfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;
            const testChannelOfComponent3 = await component3.runtime.getChannel("test2") as SharedMap;

            testChannelOfComponent2.set("channel3handle", channel3.handle);
            testChannelOfComponent3.set("channel2handle", channel2.handle);

            // Currently it will go in infinite loop.
            channel2.handle.attachGraph();
            assert.strictEqual(testChannelOfComponent2.isAttached(), true,
                "Test Channel 1 should be bound now after attaching it");
            assert.strictEqual(testChannelOfComponent3.isAttached(), true,
                "Test Channel 2 should be bound now after attaching other DDS");
            assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, true,
                "Component 2 should be attached");
            assert.strictEqual(component3.runtime.IFluidHandleContext.isAttached, true,
                "Component 3 should be attached");
        });

    it("Stick handle of 2 different components and dds in each other and then attaching 1 component should " +
        "attach other components and dds with correct recursion",
        async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent();
            await container.attach(request);

            // Create another component which returns the runtime channel.
            const peerComponent1 = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent1.peerComponent as TestFluidComponent;
            assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
                "Component2 should be unattached");

            // Create another component which returns the runtime channel.
            const peerComponent2 = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component3 = peerComponent2.peerComponent as TestFluidComponent;
            assert.strictEqual(component3.runtime.IFluidHandleContext.isAttached, false,
                "Component3 should be unattached");

            // Create first channel from component2
            const channel2 = await component2.getSharedObject<SharedMap>(mapId1);
            assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

            // Create second channel from component 3
            const channel3 = await component3.getSharedObject<SharedMap>(mapId2);
            assert.strictEqual(channel3.handle.isAttached, false, "Channel should be detached");

            // component2 POINTS TO component3, channel3
            // component3 POINTS TO component2, channel2
            // channel2   POINTS TO component3, channel3
            // channel3   POINTS TO component2, channel2
            channel2.set("channel3handle", channel3.handle);
            channel3.set("channel2handle", channel2.handle);
            channel2.set("component3", component3.handle);
            channel3.set("component2", component2.handle);
            component2.handle.bind(component3.handle);
            component2.handle.bind(channel3.handle);
            component3.handle.bind(component2.handle);
            component3.handle.bind(channel2.handle);

            component2.handle.attachGraph();
            assert.strictEqual(channel2.isAttached(), true,
                "Test Channel 2 should be bound now after attaching it");
            assert.strictEqual(channel3.isAttached(), true,
                "Test Channel 3 should be bound now after attaching other DDS");
            assert.strictEqual(component2.handle.isAttached, true,
                createTestStatementForAttachedDetached("Component2", true));
        });

    it("Generate more than 1 dds of a component and then stick handles in different dds and then attaching " +
        "1 handle should attach entire graph",
        async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent();
            await container.attach(request);

            // Create another component which returns the runtime channel.
            const peerComponent1 = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent1.peerComponent as TestFluidComponent;
            assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, false,
                "Component2 should be unattached");

            // Create another component which returns the runtime channel.
            // Create another component which returns the runtime channel.
            const peerComponent2 = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component3 = peerComponent2.peerComponent as TestFluidComponent;
            assert.strictEqual(component3.runtime.IFluidHandleContext.isAttached, false,
                "Component3 should be unattached");

            // Create another component which returns the runtime channel.
            const peerComponent3 = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component4 = peerComponent3.peerComponent as TestFluidComponent;
            assert.strictEqual(component4.runtime.IFluidHandleContext.isAttached, false,
                "Component4 should be unattached");

            // Create two channel from component2
            const channel1OfComponent2 = await component2.getSharedObject<SharedMap>(mapId1);
            assert.strictEqual(channel1OfComponent2.handle.isAttached, false, "Channel should be detached");

            const channel2OfComponent2 = await component2.getSharedObject<SharedMap>(mapId2);
            assert.strictEqual(channel2OfComponent2.handle.isAttached, false, "Channel should be detached");

            // Create two channel from component 3
            const channel1OfComponent3 = await component3.getSharedObject<SharedMap>(mapId1);
            assert.strictEqual(channel1OfComponent3.handle.isAttached, false, "Channel should be detached");

            const channel2OfComponent3 = await component3.getSharedObject<SharedMap>(mapId2);
            assert.strictEqual(channel2OfComponent3.handle.isAttached, false, "Channel should be detached");

            // Create one channel from component 4
            const channel1OfComponent4 = await component4.getSharedObject<SharedMap>(mapId1);
            assert.strictEqual(channel1OfComponent4.handle.isAttached, false, "Channel should be detached");

            channel2OfComponent2.set("componet3Handle", component3.handle);
            channel1OfComponent3.set("channel23handle", channel2OfComponent3.handle);
            component3.handle.bind(component4.handle);

            // Channel 1 of component 2 points to its parent component 2.
            // Channel 2 of component 2 points to its parent component 2 and also to component 3.
            // Channel 1 of component 3 points to its parent component 3 and its sibling channel 2 of component 3.
            // Channel 2 of component 3 points to its parent component 3.
            // Channel 1 of component 4 points to its parent component 4.
            // Component 3 points to component 4.
            channel1OfComponent2.handle.attachGraph();

            // Everything should be attached except channel 1 of component 4
            assert.strictEqual(channel1OfComponent2.isAttached(), true, "Test Channel 12 should be bound");
            assert.strictEqual(channel2OfComponent2.isAttached(), true, "Test Channel 22 should be bound");
            assert.strictEqual(channel1OfComponent3.isAttached(), true, "Test Channel 13 should be bound");
            assert.strictEqual(channel2OfComponent3.isAttached(), true, "Test Channel 23 should be bound");
            assert.strictEqual(component2.runtime.IFluidHandleContext.isAttached, true,
                "Component 2 should have get bound");
            assert.strictEqual(component3.runtime.IFluidHandleContext.isAttached, true,
                "Component 3 should have get bound");
            assert.strictEqual(component4.runtime.IFluidHandleContext.isAttached, true,
                "Component 4 should have get bound");
            assert.strictEqual(channel1OfComponent4.isAttached(), true, "Test Channel 14 should be bound");
        });

    it("Attach events on container", async () => {
        const { container } =
            await createDetachedContainerAndGetRootComponent();
        let containerAttachState = AttachState.Detached;
        container.on("attaching", () => {
            assert.strictEqual(containerAttachState, AttachState.Detached, "Should be fire from Detached state");
            assert.strictEqual(container.attachState, AttachState.Attaching,
                "Container should be attaching at this stage");
            containerAttachState = AttachState.Attaching;
        });
        container.on("attached", () => {
            assert.strictEqual(containerAttachState, AttachState.Attaching, "Should be fire from attaching state");
            assert.strictEqual(container.attachState, AttachState.Attached,
                "Container should be attached at this stage");
            containerAttachState = AttachState.Attached;
        });
        await container.attach(request);
        assert.strictEqual(containerAttachState, AttachState.Attached, "Container should end up in attached state");
    });

    it("Attach events on components", async () => {
        const { container, defaultComponent } =
            await createDetachedContainerAndGetRootComponent();
        let componentContextAttachState = AttachState.Detached;
        let componentRuntimeAttachState = AttachState.Detached;
        defaultComponent.context.once("attaching", () => {
            assert.strictEqual(componentContextAttachState, AttachState.Detached,
                "Should be fire from Detached state for context");
            assert.strictEqual(defaultComponent.context.attachState, AttachState.Attaching,
                "Component context should be attaching at this stage");
            componentContextAttachState = AttachState.Attaching;
        });

        defaultComponent.context.once("attached", () => {
            assert.strictEqual(componentContextAttachState, AttachState.Attaching,
                "Should be fire from attaching state for context");
            assert.strictEqual(defaultComponent.context.attachState, AttachState.Attached,
                "Component context should be attached at this stage");
            componentContextAttachState = AttachState.Attached;
        });

        defaultComponent.runtime.once("attaching", () => {
            assert.strictEqual(componentRuntimeAttachState, AttachState.Detached,
                "Should be fire from Detached state for runtime");
            assert.strictEqual(defaultComponent.runtime.attachState, AttachState.Attaching,
                "Component runtime should be attaching at this stage");
            componentRuntimeAttachState = AttachState.Attaching;
        });

        defaultComponent.runtime.once("attached", () => {
            assert.strictEqual(componentRuntimeAttachState, AttachState.Attaching,
                "Should be fire from attaching state for runtime");
            assert.strictEqual(defaultComponent.runtime.attachState, AttachState.Attached,
                "Component runtime should be attached at this stage");
            componentRuntimeAttachState = AttachState.Attached;
        });
        await container.attach(request);
        assert.strictEqual(componentContextAttachState, AttachState.Attached,
            "Component context should end up in attached state");
        assert.strictEqual(componentRuntimeAttachState, AttachState.Attached,
            "Component runtime should end up in attached state");
    });

    it("Attach events on not bounded components", async () => {
        const { container, defaultComponent } =
            await createDetachedContainerAndGetRootComponent();
        const peerComponent1 = await createPeerComponent(defaultComponent.context.containerRuntime);
        const component1 = peerComponent1.peerComponent as TestFluidComponent;
        peerComponent1.peerComponentRuntimeChannel.bindToContext();

        const peerComponent2 = await createPeerComponent(defaultComponent.context.containerRuntime);
        const component2 = peerComponent2.peerComponent as TestFluidComponent;

        let component1AttachState = AttachState.Detached;
        component1.context.once("attaching", () => {
            assert.strictEqual(component1AttachState, AttachState.Detached,
                "Should be fire from Detached state for context");
            assert.strictEqual(component1.context.attachState, AttachState.Attaching,
                "Component context should be attaching at this stage");
            component1AttachState = AttachState.Attaching;
        });

        component1.context.once("attached", () => {
            assert.strictEqual(component1AttachState, AttachState.Attaching,
                "Should be fire from attaching state for context");
            assert.strictEqual(component1.context.attachState, AttachState.Attached,
                "Component context should be attached at this stage");
            component1AttachState = AttachState.Attached;
        });

        component2.context.once("attaching", () => {
            assert.fail("Attaching event should not be fired for not bounded context");
        });

        component2.context.once("attached", () => {
            assert.fail("Attached event should not be fired for not bounded context");
        });
        await container.attach(request);
        assert.strictEqual(component1.runtime.attachState, AttachState.Attached,
            "Component 1 should end up in attached state");
        assert.strictEqual(component2.runtime.attachState, AttachState.Detached,
            "Component 2 should end up in detached state as it was not bound");
    });

    it("Attach events on handle bounded components", async () => {
        const { container, defaultComponent } =
            await createDetachedContainerAndGetRootComponent();
        const peerComponent1 = await createPeerComponent(defaultComponent.context.containerRuntime);
        const component1 = peerComponent1.peerComponent as TestFluidComponent;
        peerComponent1.peerComponentRuntimeChannel.bindToContext();

        const peerComponent2 = await createPeerComponent(defaultComponent.context.containerRuntime);
        const component2 = peerComponent2.peerComponent as TestFluidComponent;

        const rootMapOfComponent1 = await component1.getSharedObject<SharedMap>(mapId1);
        rootMapOfComponent1.set("comp2", component2.handle);

        let component1AttachState = AttachState.Detached;
        let component2AttachState = AttachState.Detached;
        component1.context.once("attaching", () => {
            assert.strictEqual(component1AttachState, AttachState.Detached,
                "Should be fire from Detached state for context");
            assert.strictEqual(component1.context.attachState, AttachState.Attaching,
                "Component context should be attaching at this stage");
            component1AttachState = AttachState.Attaching;
        });

        component1.context.once("attached", () => {
            assert.strictEqual(component1AttachState, AttachState.Attaching,
                "Should be fire from attaching state for context");
            assert.strictEqual(component1.context.attachState, AttachState.Attached,
                "Component context should be attached at this stage");
            component1AttachState = AttachState.Attached;
        });

        component2.context.once("attaching", () => {
            assert.strictEqual(component2AttachState, AttachState.Detached,
                "Should be fire from Detached state for context");
            assert.strictEqual(component2.context.attachState, AttachState.Attaching,
                "Component context should be attaching at this stage");
            component2AttachState = AttachState.Attaching;
        });

        component2.context.once("attached", () => {
            assert.strictEqual(component2AttachState, AttachState.Attaching,
                "Should be fire from attaching state for context");
            assert.strictEqual(component2.context.attachState, AttachState.Attached,
                "Component context should be attached at this stage");
            component2AttachState = AttachState.Attached;
        });
        await container.attach(request);
        assert.strictEqual(component1.runtime.attachState, AttachState.Attached,
            "Component 1 should end up in attached state");
        assert.strictEqual(component2.runtime.attachState, AttachState.Attached,
            "Component 2 should end up in attached state as its handle was stored in map of bound component");
    });

    afterEach(async () => {
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
