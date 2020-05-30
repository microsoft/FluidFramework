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
} from "@fluidframework/test-utils";
import { SharedObject } from "@fluidframework/shared-object-base";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { TestRootComponent } from "@fluidframework/local-test-utils";

[true, false].forEach((isLocal) => {
    describe(`Attach/Register/Local Api Tests For ${isLocal ? "Local" : "Live"} Container`, () => {
        const documentId = "detachedContainerTest";
        const pkg1: IFluidCodeDetails = {
            package: "detachedContainerTestPackage1",
            config: {},
        };
        const pkg2: IFluidCodeDetails = {
            package: "detachedContainerTestPackage2",
            config: {},
        };

        let request: IRequest;
        let testDeltaConnectionServer: ILocalDeltaConnectionServer;
        let loader: Loader;

        const createTestStatementForLocalLive = (name: string, local: boolean) =>
            `${name} should be ${local ? "local" : "live"}`;

        async function createDetachedContainerAndGetRootComponent<T>(pkg: IFluidCodeDetails) {
            const container = await loader.createDetachedContainer(pkg);
            // Get the root component from the detached container.
            const response = await container.request({ url: "/" });
            const defaultComponent = response.value as T;
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

        const createPeerComponentForTestRootComponent = async (
            component: TestRootComponent,
        ) => {
            const peerComponentRuntimeChannel = await component.createComponentWithRealizationFn(["default"]);
            const peerComponent =
                (await peerComponentRuntimeChannel.request({ url: "/" })).value as TestRootComponent;
            return peerComponent;
        };

        function createTestLoader(urlResolver: IUrlResolver): Loader {
            const factory: TestFluidComponentFactory = new TestFluidComponentFactory([]);
            const testComponentFactory = new PrimedComponentFactory(
                TestRootComponent.type,
                TestRootComponent,
                [SharedMap.getFactory()],
                {},
            );
            const codeLoader = new LocalCodeLoader([[pkg1, factory], [pkg2, testComponentFactory]]);
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
                await createDetachedContainerAndGetRootComponent<ITestFluidComponent>(pkg1);
            if (!isLocal) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;
            const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;

            assert.strictEqual(component2.runtime.isLocal(), true, createTestStatementForLocalLive("Component2", true));
            assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

            // Create a channel
            const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");
            assert.strictEqual(channel.isLocal(), true, "Channel should be local");

            component2RuntimeChannel.attach();

            assert.strictEqual(component2.runtime.isLocal(), isLocal,
                createTestStatementForLocalLive("Component2", false));
            assert.strictEqual(component2.runtime.isAttached, true, "Component2 should be attached");

            assert.strictEqual(channel.isRegistered(), false,
                "Channel should not be registered as it was not registered");
            assert.strictEqual(channel.handle.isAttached, false,
                "Channel should not be attached as it was not registered");
        });

        it("Attaching component should attach registered DDS", async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent<ITestFluidComponent>(pkg1);
            if (!isLocal) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;
            const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;
            assert.strictEqual(component2.runtime.isLocal(), true,
                createTestStatementForLocalLive("Component2", true));
            assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

            // Create a channel
            const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            // Now register the channel
            (await channel.handle.get() as SharedObject).register();
            assert.strictEqual(channel.isRegistered(), true, "Channel should be registered");
            component2RuntimeChannel.attach();

            assert.strictEqual(component2.runtime.isLocal(), isLocal,
                createTestStatementForLocalLive("Component2", false));
            assert.strictEqual(component2.runtime.isAttached, true, "Component2 should be attached");

            // Channel should get attached as it was registered to its component
            assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");
        });

        it("Attaching DDS should attach component", async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent<ITestFluidComponent>(pkg1);
            if (!isLocal) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;
            assert.strictEqual(component2.runtime.isLocal(), true,
                createTestStatementForLocalLive("Component2", true));
            assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

            // Create a channel
            const channel = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
            assert.strictEqual(channel.isRegistered(), false, "Channel should be unregistered");
            assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

            channel.handle.attach();
            assert.strictEqual(channel.isRegistered(), true, "Channel should be registered after attaching");

            // Channel should get attached as it was registered to its component
            assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");

            assert.strictEqual(component2.runtime.isLocal(), isLocal,
                createTestStatementForLocalLive("Component2", false));
            assert.strictEqual(component2.runtime.isAttached, true, "Component2 should be attached");
        });

        it("Sticking handle in attached dds should attach the DDS", async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent<ITestFluidComponent>(pkg1);
            if (!isLocal) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;
            const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;
            assert.strictEqual(component2.runtime.isLocal(), true,
                createTestStatementForLocalLive("Component2", true));
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
            assert.strictEqual(testChannelOfComponent2.handle.isAttached, false,
                "Test Channel should not be attached ");
            rootOfComponent2.set("test1handle", channel.handle);

            assert.strictEqual(testChannelOfComponent2.handle.isAttached, true,
                "Test Channel should be attached now after sticking it in attached dds");
        });

        it("Registering DDS in attached component should attach it", async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent<ITestFluidComponent>(pkg1);
            if (!isLocal) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;
            const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;

            assert.strictEqual(component2.runtime.isLocal(), true,
                createTestStatementForLocalLive("Component2", true));
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

        it("Registering DDS in detached component should not attach it", async () => {
            const { container, defaultComponent } =
                await createDetachedContainerAndGetRootComponent<ITestFluidComponent>(pkg1);
            if (!isLocal) {
                await container.attach(request);
            }

            // Create another component which returns the runtime channel.
            const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
            const component2 = peerComponent.peerComponent;

            assert.strictEqual(component2.runtime.isLocal(), true,
                createTestStatementForLocalLive("Component2", true));
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

        it("Stick handle of 2 dds in each other and then attaching component should attach both DDS",
            async () => {
                const { container, defaultComponent } =
                    await createDetachedContainerAndGetRootComponent<ITestFluidComponent>(pkg1);
                if (!isLocal) {
                    await container.attach(request);
                }

                // Create another component which returns the runtime channel.
                const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component2 = peerComponent.peerComponent;
                const component2RuntimeChannel = peerComponent.peerComponentRuntimeChannel;

                assert.strictEqual(component2.runtime.isLocal(), true,
                    createTestStatementForLocalLive("Component2", true));
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
                const testChannel2OfComponent2 = await component2.runtime.getChannel("test2") as SharedMap;

                testChannel1OfComponent2.set("test2handle", channel2.handle);
                testChannel2OfComponent2.set("test1handle", channel1.handle);

                // Now attach the component2. Currently this will end up in infinite loop.
                component2RuntimeChannel.attach();
                assert.strictEqual(testChannel1OfComponent2.handle.isAttached, true,
                    "Test Channel 1 should be attached now after attaching parent component");
                assert.strictEqual(testChannel2OfComponent2.handle.isAttached, true,
                    "Test Channel 2 should be attached now after attaching parent component");
            });

        it("Stick handle of 2 dds in each other and then attaching 1 DDS should attach other DDS",
            async () => {
                const { container, defaultComponent } =
                    await createDetachedContainerAndGetRootComponent<ITestFluidComponent>(pkg1);
                if (!isLocal) {
                    await container.attach(request);
                }

                // Create another component which returns the runtime channel.
                const peerComponent = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component2 = peerComponent.peerComponent;

                assert.strictEqual(component2.runtime.isLocal(), true,
                    createTestStatementForLocalLive("Component2", true));
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
                const testChannel2OfComponent2 = await component2.runtime.getChannel("test2") as SharedMap;

                testChannel1OfComponent2.set("test2handle", channel2.handle);
                testChannel2OfComponent2.set("test1handle", channel1.handle);

                // Currently it will go in infinite loop.
                channel1.handle.attach();
                assert.strictEqual(testChannel1OfComponent2.handle.isAttached, true,
                    "Test Channel 1 should be attached now after attaching it");
                assert.strictEqual(testChannel2OfComponent2.handle.isAttached, true,
                    "Test Channel 2 should be attached now after attaching other DDS");
            });

        // eslint-disable-next-line max-len
        it("Stick handle of 2 dds(of 2 different components) in each other and then attaching 1 DDS should attach other DDS and component with correct recursion",
            async () => {
                const { container, defaultComponent } =
                    await createDetachedContainerAndGetRootComponent<ITestFluidComponent>(pkg1);
                if (!isLocal) {
                    await container.attach(request);
                }

                // Create another component which returns the runtime channel.
                const peerComponent1 = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component2 = peerComponent1.peerComponent;
                assert.strictEqual(component2.runtime.isLocal(), true,
                    createTestStatementForLocalLive("Component2", true));
                assert.strictEqual(component2.runtime.isAttached, false, "Component2 should be unattached");

                // Create another component which returns the runtime channel.
                const peerComponent2 = await createPeerComponent(defaultComponent.context.containerRuntime);
                const component3 = peerComponent2.peerComponent;
                assert.strictEqual(component3.runtime.isLocal(), true,
                    createTestStatementForLocalLive("Component2", true));
                assert.strictEqual(component3.runtime.isAttached, false, "Component2 should be unattached");

                // Create first channel from component2
                const channel2 = component2.runtime.createChannel("test1", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel2.isRegistered(), false, "Channel should be unregistered");
                assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

                // Create second channel from component 3
                const channel3 = component3.runtime.createChannel("test2", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel3.isRegistered(), false, "Channel should be unregistered");
                assert.strictEqual(channel3.handle.isAttached, false, "Channel should be detached");

                const testChannelOfComponent2 = await component2.runtime.getChannel("test1") as SharedMap;
                const testChannelOfComponent3 = await component3.runtime.getChannel("test2") as SharedMap;

                testChannelOfComponent2.set("channel3handle", channel3.handle);
                testChannelOfComponent3.set("channel2handle", channel2.handle);

                // Currently it will go in infinite loop.
                channel2.handle.attach();
                assert.strictEqual(testChannelOfComponent2.handle.isAttached, true,
                    "Test Channel 1 should be attached now after attaching it");
                assert.strictEqual(testChannelOfComponent3.handle.isAttached, true,
                    "Test Channel 2 should be attached now after attaching other DDS");
                assert.strictEqual(component2.runtime.isAttached, true, "Component 2 should have get attached");
                assert.strictEqual(component3.runtime.isAttached, true, "Component 3 should have get attached");
            });

        // eslint-disable-next-line max-len
        it("Stick handle of 2 different components and dds in each other and then attaching 1 component should attach other components and dds with correct recursion",
            async () => {
                const { container, defaultComponent } =
                    await createDetachedContainerAndGetRootComponent<TestRootComponent>(pkg2);
                if (!isLocal) {
                    await container.attach(request);
                }

                // Create another component which returns the runtime channel.
                const component2 = await createPeerComponentForTestRootComponent(defaultComponent);
                assert.strictEqual(component2.handle.isAttached, false, "Component2 should be unattached");

                // Create another component which returns the runtime channel.
                const component3 = await createPeerComponentForTestRootComponent(defaultComponent);
                assert.strictEqual(component3.handle.isAttached, false, "Component3 should be unattached");

                // Create first channel from component2
                const channel2 = component2.createType<SharedMap>("test1", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel2.isRegistered(), false, "Channel should be unregistered");
                assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

                // Create second channel from component 3
                const channel3 = component3.createType<SharedMap>("test2", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel3.isRegistered(), false, "Channel should be unregistered");
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

                component2.handle.attach();
                assert.strictEqual(channel2.handle.isAttached, true,
                    "Test Channel 2 should be attached now after attaching it");
                assert.strictEqual(channel3.handle.isAttached, true,
                    "Test Channel 3 should be attached now after attaching other DDS");
                assert.strictEqual(component2.handle.isAttached, true, "Component 2 should have get attached");
                assert.strictEqual(component3.handle.isAttached, true, "Component 3 should have get attached");
            });

        // eslint-disable-next-line max-len
        it("Generate more than 1 dds of a component and then stick handles in different dds and then attaching 1 handle should attach entire graph",
            async () => {
                const { container, defaultComponent } =
                    await createDetachedContainerAndGetRootComponent<TestRootComponent>(pkg2);
                if (!isLocal) {
                    await container.attach(request);
                }

                // Create another component which returns the runtime channel.
                const component2 = await createPeerComponentForTestRootComponent(defaultComponent);
                assert.strictEqual(component2.handle.isAttached, false, "Component2 should be unattached");

                // Create another component which returns the runtime channel.
                const component3 = await createPeerComponentForTestRootComponent(defaultComponent);
                assert.strictEqual(component3.handle.isAttached, false, "Component3 should be unattached");

                const component4 = await createPeerComponentForTestRootComponent(defaultComponent);
                assert.strictEqual(component4.handle.isAttached, false, "Component4 should be unattached");

                // Create two channel from component2
                const channel1OfComponent2 =
                    component2.createType<SharedMap>("test1", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel1OfComponent2.isRegistered(), false, "Channel should be unregistered");
                assert.strictEqual(channel1OfComponent2.handle.isAttached, false, "Channel should be detached");

                const channel2OfComponent2 =
                    component2.createType<SharedMap>("test2", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel2OfComponent2.isRegistered(), false, "Channel should be unregistered");
                assert.strictEqual(channel2OfComponent2.handle.isAttached, false, "Channel should be detached");

                // Create two channel from component 3
                const channel1OfComponent3 =
                    component3.createType<SharedMap>("test1", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel1OfComponent3.isRegistered(), false, "Channel should be unregistered");
                assert.strictEqual(channel1OfComponent3.handle.isAttached, false, "Channel should be detached");

                const channel2OfComponent3 =
                    component3.createType<SharedMap>("test2", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel2OfComponent3.isRegistered(), false, "Channel should be unregistered");
                assert.strictEqual(channel2OfComponent3.handle.isAttached, false, "Channel should be detached");

                // Create one channel from component 4
                const channel1OfComponent4 =
                    component4.createType<SharedMap>("test1", "https://graph.microsoft.com/types/map");
                assert.strictEqual(channel1OfComponent4.isRegistered(), false, "Channel should be unregistered");
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
                channel1OfComponent2.handle.attach();

                // Everything should be attached except channel 1 of component 4
                assert.strictEqual(channel1OfComponent2.handle.isAttached, true, "Test Channel 12 should be attached");
                assert.strictEqual(channel2OfComponent2.handle.isAttached, true, "Test Channel 22 should be attached");
                assert.strictEqual(channel1OfComponent3.handle.isAttached, true, "Test Channel 13 should be attached");
                assert.strictEqual(channel2OfComponent3.handle.isAttached, true, "Test Channel 23 should be attached");
                assert.strictEqual(component2.handle.isAttached, true, "Component 2 should have get attached");
                assert.strictEqual(component3.handle.isAttached, true, "Component 3 should have get attached");
                assert.strictEqual(component4.handle.isAttached, true, "Component 4 should have get attached");
                assert.strictEqual(channel1OfComponent4.handle.isAttached, true, "Test Channel 14 should be attached");
            });

        afterEach(async () => {
            await testDeltaConnectionServer.webSocketServer.close();
        });
    });
});
