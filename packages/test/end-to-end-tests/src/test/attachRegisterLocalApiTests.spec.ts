/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IRequest } from "@fluidframework/component-core-interfaces";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { TestDocumentServiceFactory, TestResolver } from "@fluidframework/local-driver";
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

[true, false].forEach((isAttached) => {
    describe(`Attach/Bind Api Tests For ${isAttached ? "Attached" : "Detached"} Container`, () => {
        const documentId = "detachedContainerTest";
        const codeDetails: IFluidCodeDetails = {
            package: "detachedContainerTestPackage1",
            config: {},
        };
        const mapId1 = "mapId1";
        const mapId2 = "mapId2";

        let request: IRequest;
        let testDeltaConnectionServer: ILocalDeltaConnectionServer;
        let loader: Loader;

        const createTestStatementForAttachedDetached = (name: string, attached: boolean) =>
            `${name} should be ${attached ? "Attached" : "Detached"}`;

        async function createDetachedContainerAndGetRootComponent() {
            const container = await loader.createDetachedContainer(codeDetails);
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
            const peerComponentRuntimeChannel = await (containerRuntime as IContainerRuntime)
                .createComponentWithRealizationFn(["default"]);
            const peerComponent =
                (await peerComponentRuntimeChannel.request({ url: "/" })).value as ITestFluidComponent;
            return {
                peerComponent,
                peerComponentRuntimeChannel,
            };
        };

        function createTestLoader(urlResolver: IUrlResolver): Loader {
            const factory: TestFluidComponentFactory = new TestFluidComponentFactory([
                [mapId1, SharedMap.getFactory()],
                [mapId2, SharedMap.getFactory()],
            ]);
            const codeLoader = new LocalCodeLoader([[codeDetails, factory]]);
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

        it("Attaching component should not attach unregistered DDS", async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent();
            if (isAttached) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;
            const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;

            assert.strictEqual(component2.runtime.isAttached, false,
                createTestStatementForAttachedDetached("Component2", false));
            assert.strictEqual(component2.runtime.isBoundToContainer, false, "Component2 should be unbound");

            // Create a channel
            const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.isBoundToComponent(), false, "Channel should be unregistered");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            component2RuntimeChannel.bindToContainer();

            assert.strictEqual(component2.runtime.isAttached, isAttached,
                createTestStatementForAttachedDetached("Component2", isAttached));
            assert.strictEqual(component2.runtime.isBoundToContainer, true, "Component2 should be bound");

            assert.strictEqual(channel.isBoundToComponent(), false,
                "Channel should not be registered as it was not registered");
            assert.strictEqual(channel.handle.isAttached, false,
                "Channel should not be attached as it was not registered");
        });

        it("Attaching component should attach registered DDS", async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent();
            if (isAttached) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;
            const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;
            assert.strictEqual(component2.runtime.isAttached, false,
                createTestStatementForAttachedDetached("Component2", false));
            assert.strictEqual(component2.runtime.isBoundToContainer, false, "Component2 should be unbound");

            // Create a channel
            const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.isBoundToComponent(), false, "Channel should be unregistered");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            // Now register the channel
            (await channel.handle.get() as SharedObject).bindToComponent();
            assert.strictEqual(channel.isBoundToComponent(), true, "Channel should be registered");
            component2RuntimeChannel.bindToContainer();

            assert.strictEqual(component2.runtime.isAttached, isAttached,
                createTestStatementForAttachedDetached("Component2", isAttached));
            assert.strictEqual(component2.runtime.isBoundToContainer, true, "Component2 should be bound");

            // Channel should get attached as it was registered to its component
            assert.strictEqual(channel.handle.isAttached, isAttached,
                createTestStatementForAttachedDetached("Channel", isAttached));
        });

        it("Attaching DDS should attach component", async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent();
            if (isAttached) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;
            assert.strictEqual(component2.runtime.isAttached, false,
                createTestStatementForAttachedDetached("Component2", false));
            assert.strictEqual(component2.runtime.isBoundToContainer, false, "Component2 should be unbound");

            // Create a channel
            const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.isBoundToComponent(), false, "Channel should be unregistered");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            channel.handle.attachGraph();
            assert.strictEqual(channel.isBoundToComponent(), true,
                createTestStatementForAttachedDetached("Channel", isAttached));

            // Channel should get attached as it was registered to its component
            assert.strictEqual(channel.handle.isAttached, isAttached, "Channel should be attached");

            assert.strictEqual(component2.runtime.isAttached, isAttached,
                createTestStatementForAttachedDetached("Component2", isAttached));
            assert.strictEqual(component2.runtime.isBoundToContainer, true, "Component2 should be bound");
        });

        it("Sticking handle in attached dds should attach the DDS in attached container", async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent();
            if (isAttached) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;
            const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;
            assert.strictEqual(component2.runtime.isAttached, false,
                createTestStatementForAttachedDetached("Component2", false));
            assert.strictEqual(component2.runtime.isBoundToContainer, false, "Component2 should be NotBound");

            // Create a channel
            const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.isBoundToComponent(), false, "Channel should be unregistered");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            component2RuntimeChannel.bindToContainer();

            const rootOfComponent2 = await component2.runtime.getChannel("root") as SharedMap;
            const testChannelOfComponent2 = await component2.runtime.getChannel("test1");

            assert.strictEqual(rootOfComponent2.isBoundToComponent(), true,
                "Root Channel should be bound");
            assert.strictEqual(testChannelOfComponent2.isBoundToComponent(), false,
                "Test Channel should not be bound");
            rootOfComponent2.set("test1handle", channel.handle);

            assert.strictEqual(testChannelOfComponent2.isBoundToComponent(), isAttached,
                "Test Channel should be bound only in attached container after sticking it in bounded dds");
        });

        it("Registering DDS in attached component should attach it", async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent();
            if (isAttached) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;
            const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;

            assert.strictEqual(component2.runtime.isAttached, false,
                createTestStatementForAttachedDetached("Component2", false));
            assert.strictEqual(component2.runtime.isBoundToContainer, false, "Component2 should be NotBound");

            // Create a channel
            const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.isBoundToComponent(), false, "Channel should be unregistered");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            component2RuntimeChannel.bindToContainer();

            (await channel.handle.get() as SharedObject).bindToComponent();
            assert.strictEqual(channel.isBoundToComponent(), true, "Channel should be registered");
            assert.strictEqual(channel.handle.isAttached, isAttached,
                createTestStatementForAttachedDetached("Channel", isAttached));
        });

        it("Registering DDS in detached component should not attach it", async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent();
            if (isAttached) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;

            assert.strictEqual(component2.runtime.isAttached, false,
                createTestStatementForAttachedDetached("Component2", false));
            assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

            // Create a channel
            const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.isBoundToComponent(), false, "Channel should be unregistered");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            (await channel.handle.get() as SharedObject).bindToComponent();
            assert.strictEqual(channel.isBoundToComponent(), true, "Channel should be registered");
            assert.strictEqual(channel.handle.isAttached, false,
                "Channel should not get attached on registering it to unattached component");
        });

        it("Stick handle of 2 dds in each other and then attaching component should attach both DDS",
            async () => {
                const { container, defaultComponent } =
                    await createDetachedContainerAndGetRootComponent();
                if (isAttached) {
                    await container.attach(request);
                }

                // Create another component which returns the runtime channel.
                const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component2 = peerComponent.peerComponent;
                const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;

                assert.strictEqual(component2.runtime.isAttached, false,
                    createTestStatementForAttachedDetached("Component2", false));
                assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

                // Create first channel
                const channel1 = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel1.isBoundToComponent(), false, "Channel should be unregistered");
                assert.strictEqual(channel1.handle.isAttached, false, "Channel should be detached");

                // Create second channel
                const channel2 = component2.runtime.createChannel("test2", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel2.isBoundToComponent(), false, "Channel should be unregistered");
                assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

                // Now register both dds to parent component
                (await channel1.handle.get() as SharedObject).bindToComponent();
                (await channel2.handle.get() as SharedObject).bindToComponent();

                const testChannel1OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;
                const testChannel2OfComponent2 = await component2.runtime.getChannel("test2") as SharedMap;

                testChannel1OfComponent2.set("test2handle", channel2.handle);
                testChannel2OfComponent2.set("test1handle", channel1.handle);

                // Now attach the component2. Currently this will end up in infinite loop.
                component2RuntimeChannel.bindToContainer();
                assert.strictEqual(testChannel1OfComponent2.isBoundToComponent(), true,
                    "Test Channel 1 should be bound now after attaching parent component");
                assert.strictEqual(testChannel2OfComponent2.isBoundToComponent(), true,
                    "Test Channel 2 should be bound now after attaching parent component");
                assert.strictEqual(testChannel1OfComponent2.handle.isAttached, isAttached,
                    createTestStatementForAttachedDetached("Test Channel 1", isAttached));
                assert.strictEqual(testChannel2OfComponent2.handle.isAttached, isAttached,
                    createTestStatementForAttachedDetached("Test Channel 1", isAttached));
            });

        it("Stick handle of 2 dds in each other and then attaching 1 DDS should attach other DDS",
            async () => {
                const { container, defaultComponent } =
                    await createDetachedContainerAndGetRootComponent();
                if (isAttached) {
                    await container.attach(request);
                }

                // Create another component which returns the runtime channel.
                const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component2 = peerComponent.peerComponent;

                assert.strictEqual(component2.runtime.isAttached, false,
                    createTestStatementForAttachedDetached("Component2", false));
                assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

                // Create first channel
                const channel1 = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel1.isBoundToComponent(), false, "Channel should be unregistered");
                assert.strictEqual(channel1.handle.isAttached, false, "Channel should be detached");

                // Create second channel
                const channel2 = component2.runtime.createChannel("test2", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel2.isBoundToComponent(), false, "Channel should be unregistered");
                assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

                // Now register both dds to parent component
                (await channel1.handle.get() as SharedObject).bindToComponent();
                (await channel2.handle.get() as SharedObject).bindToComponent();

                const testChannel1OfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;
                const testChannel2OfComponent2 = await component2.runtime.getChannel("test2") as SharedMap;

                testChannel1OfComponent2.set("test2handle", channel2.handle);
                testChannel2OfComponent2.set("test1handle", channel1.handle);

                channel1.handle.attachGraph();
                assert.strictEqual(testChannel1OfComponent2.isBoundToComponent(), true,
                    "Test Channel 1 should be bound now after attaching graph it");
                assert.strictEqual(testChannel2OfComponent2.isBoundToComponent(), true,
                    "Test Channel 2 should be bound now after attaching other DDS");
            });

        it("Stick handle of 2 dds(of 2 different components) in each other and then attaching 1 DDS should " +
            "attach other DDS and component with correct recursion",
            async () => {
                const { container, defaultComponent } =
                    await createDetachedContainerAndGetRootComponent();
                if (isAttached) {
                    await container.attach(request);
                }

                // Create another component which returns the runtime channel.
                const peerComponent1 = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component2 = peerComponent1.peerComponent;
                assert.strictEqual(component2.runtime.isAttached, false,
                    createTestStatementForAttachedDetached("Component2", false));
                assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

                // Create another component which returns the runtime channel.
                const peerComponent2 = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component3 = peerComponent2.peerComponent;
                assert.strictEqual(component3.runtime.isAttached, false,
                    createTestStatementForAttachedDetached("Component2", false));
                assert.strictEqual(component3.runtime.isBoundToContainer, false, "Component2 should be unbound");

                // Create first channel from component2
                const channel2 = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel2.isBoundToComponent(), false, "Channel should be unregistered");
                assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

                // Create second channel from component 3
                const channel3 = component3.runtime.createChannel("test2", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel3.isBoundToComponent(), false, "Channel should be unregistered");
                assert.strictEqual(channel3.handle.isAttached, false, "Channel should be detached");

                const testChannelOfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;
                const testChannelOfComponent3 = await component3.runtime.getChannel("test2") as SharedMap;

                testChannelOfComponent2.set("channel3handle", channel3.handle);
                testChannelOfComponent3.set("channel2handle", channel2.handle);

                // Currently it will go in infinite loop.
                channel2.handle.attachGraph();
                assert.strictEqual(testChannelOfComponent2.isBoundToComponent(), true,
                    "Test Channel 1 should be bound now after attaching it");
                assert.strictEqual(testChannelOfComponent3.isBoundToComponent(), true,
                    "Test Channel 2 should be bound now after attaching other DDS");
                assert.strictEqual(component2.runtime.isBoundToContainer, true, "Component 2 should have get bound");
                assert.strictEqual(component3.runtime.isBoundToContainer, true, "Component 3 should have get bound");
            });

        it("Stick handle of 2 different components and dds in each other and then attaching 1 component should " +
            "attach other components and dds with correct recursion",
            async () => {
                const { container, defaultComponent } =
                    await createDetachedContainerAndGetRootComponent();
                if (isAttached) {
                    await container.attach(request);
                }

                // Create another component which returns the runtime channel.
                const peerComponent1 = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component2 = peerComponent1.peerComponent as TestFluidComponent;
                assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

                // Create another component which returns the runtime channel.
                const peerComponent2 = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component3 = peerComponent2.peerComponent as TestFluidComponent;
                assert.strictEqual(component3.runtime.isAttached, false, "Component3 should be unattached");

                // Create first channel from component2
                const channel2 = await component2.getSharedObject<SharedMap>(mapId1);
                assert.strictEqual(channel2.isBoundToComponent(), false, "Channel should be unregistered");
                assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

                // Create second channel from component 3
                const channel3 = await component3.getSharedObject<SharedMap>(mapId2);
                assert.strictEqual(channel3.isBoundToComponent(), false, "Channel should be unregistered");
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
                assert.strictEqual(channel2.isBoundToComponent(), true,
                    "Test Channel 2 should be bound now after attaching it");
                assert.strictEqual(channel3.isBoundToComponent(), true,
                    "Test Channel 3 should be bound now after attaching other DDS");
                assert.strictEqual(component2.handle.isAttached, isAttached,
                    createTestStatementForAttachedDetached("Component2", isAttached));
            });

        it("Generate more than 1 dds of a component and then stick handles in different dds and then attaching " +
            "1 handle should attach entire graph",
            async () => {
                const { container, defaultComponent } =
                    await createDetachedContainerAndGetRootComponent();
                if (isAttached) {
                    await container.attach(request);
                }

                // Create another component which returns the runtime channel.
                const peerComponent1 = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component2 = peerComponent1.peerComponent as TestFluidComponent;
                assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

                // Create another component which returns the runtime channel.
                // Create another component which returns the runtime channel.
                const peerComponent2 = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component3 = peerComponent2.peerComponent as TestFluidComponent;
                assert.strictEqual(component3.runtime.isAttached, false, "Component3 should be unattached");

                // Create another component which returns the runtime channel.
                const peerComponent3 = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component4 = peerComponent3.peerComponent as TestFluidComponent;
                assert.strictEqual(component4.runtime.isAttached, false, "Component4 should be unattached");

                // Create two channel from component2
                const channel1OfComponent2 = await component2.getSharedObject<SharedMap>(mapId1);
                assert.strictEqual(channel1OfComponent2.isBoundToComponent(), false, "Channel should be unregistered");
                assert.strictEqual(channel1OfComponent2.handle.isAttached, false, "Channel should be detached");

                const channel2OfComponent2 = await component2.getSharedObject<SharedMap>(mapId2);
                assert.strictEqual(channel2OfComponent2.isBoundToComponent(), false, "Channel should be unregistered");
                assert.strictEqual(channel2OfComponent2.handle.isAttached, false, "Channel should be detached");

                // Create two channel from component 3
                const channel1OfComponent3 = await component3.getSharedObject<SharedMap>(mapId1);
                assert.strictEqual(channel1OfComponent3.isBoundToComponent(), false, "Channel should be unregistered");
                assert.strictEqual(channel1OfComponent3.handle.isAttached, false, "Channel should be detached");

                const channel2OfComponent3 = await component3.getSharedObject<SharedMap>(mapId2);
                assert.strictEqual(channel2OfComponent3.isBoundToComponent(), false, "Channel should be unregistered");
                assert.strictEqual(channel2OfComponent3.handle.isAttached, false, "Channel should be detached");

                // Create one channel from component 4
                const channel1OfComponent4 = await component4.getSharedObject<SharedMap>(mapId1);
                assert.strictEqual(channel1OfComponent4.isBoundToComponent(), false, "Channel should be unregistered");
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
                assert.strictEqual(channel1OfComponent2.isBoundToComponent(), true, "Test Channel 12 should be bound");
                assert.strictEqual(channel2OfComponent2.isBoundToComponent(), true, "Test Channel 22 should be bound");
                assert.strictEqual(channel1OfComponent3.isBoundToComponent(), true, "Test Channel 13 should be bound");
                assert.strictEqual(channel2OfComponent3.isBoundToComponent(), true, "Test Channel 23 should be bound");
                assert.strictEqual(component2.isBoundToContainer, true, "Component 2 should have get bound");
                assert.strictEqual(component3.isBoundToContainer, true, "Component 3 should have get bound");
                assert.strictEqual(component4.isBoundToContainer, true, "Component 4 should have get bound");
                assert.strictEqual(channel1OfComponent4.isBoundToComponent(), true, "Test Channel 14 should be bound");
            });

        afterEach(async () => {
            await testDeltaConnectionServer.webSocketServer.close();
        });
    });
});
