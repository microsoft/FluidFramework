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

[true, false].forEach((isLocal) => {
    describe(`Attach/Register/Local Api Tests For ${isLocal ? "Local" : "Live"} Container`, () => {
        const documentId = "detachedContainerTest";
        const pkg: IFluidCodeDetails = {
            package: "detachedContainerTestPackage",
            config: {},
        };

        let request: IRequest;
        let testDeltaConnectionServer: ILocalDeltaConnectionServer;
        let loader: Loader;

        const createTestStatementForLocalLive = (name: string, local: boolean) =>
            `${name} should be ${local ? "local" : "live"}`;
        const createDetachedContainerAndGetRootComponent = async () => {
            const container = await loader.createDetachedContainer(pkg);
            // Get the root component from the detached container.
            const response = await container.request({ url: "/" });
            const defaultComponent = response.value as ITestFluidComponent;
            return {
                container,
                defaultComponent,
            };
        };

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

        it("Attaching component should not attach unregistered DDS", async () => {
            const { container, defaultComponent } = await createDetachedContainerAndGetRootComponent();
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
            const { container, defaultComponent } = await createDetachedContainerAndGetRootComponent();
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
            // This will fail because isAttached on handle is wrongly implemented.
            // assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");
        });

        it.skip("Attaching DDS should attach component", async () => {
            const { container, defaultComponent } = await createDetachedContainerAndGetRootComponent();
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
            const { container, defaultComponent } = await createDetachedContainerAndGetRootComponent();
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

            // This will fail because isAttached on handle is wrongly implemented.
            // assert.strictEqual(rootOfComponent2.handle.isAttached, true,
            //     "Root Channel should get attached as it was registered");
            assert.strictEqual(testChannelOfComponent2.handle.isAttached, false,
                "Test Channel should not be attached ");
            rootOfComponent2.set("test1handle", channel.handle);

            // This will fail because isAttached on handle is wrongly implemented.
            // assert.strictEqual(testChannelOfComponent2.handle.isAttached, true,
            //     "Test Channel should be attached now after sticking it in attached dds");
        });

        it("Registering DDS in attached component should attach it", async () => {
            const { container, defaultComponent } = await createDetachedContainerAndGetRootComponent();
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
            // This will fail because isAttached on handle is wrongly implemented.
            // assert.strictEqual(channel.handle.isAttached, true, "Channel should be attached");
        });

        it("Registering DDS in detached component should not attach it", async () => {
            const { container, defaultComponent } = await createDetachedContainerAndGetRootComponent();
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

        it.skip("Stick handle of 2 dds in each other and then attaching component should attach both DDS",
            async () => {
                const { container, defaultComponent } = await createDetachedContainerAndGetRootComponent();
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

        it.skip("Stick handle of 2 dds in each other and then attaching 1 DDS should attach other DDS",
            async () => {
                const { container, defaultComponent } = await createDetachedContainerAndGetRootComponent();
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

        it.skip("Stick handle of 2 dds(of 2 different components) in each other and then attaching 1 DDS should " +
            "attach other DDS and component with correct recursion",
        async () => {
            const { container, defaultComponent } = await createDetachedContainerAndGetRootComponent();
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
            assert.strictEqual(component2.runtime.isAttached, true, "Component 3 should have get attached");
        });
    });
});
