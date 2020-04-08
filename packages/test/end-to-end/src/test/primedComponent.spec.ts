/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails, ILoader } from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
//import { DocumentDeltaEventManager } from "@microsoft/fluid-local-driver";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@microsoft/fluid-test-utils";

const PrimedType = "@microsoft/fluid-primedComponent";

/**
 * My sample component
 */
class Component extends PrimedComponent {
    public get root(): ISharedDirectory {
        return super.root;
    }
    public async writeBlob(blob: string): Promise<IComponentHandle<string>> {
        return super.writeBlob(blob);
    }
}

describe("PrimedComponent", () => {

    describe("Blob support", () => {
        const id = "fluid-test://localhost/primedComponentTest";
        const codeDetails: IFluidCodeDetails = {
            package: "primedComponentTestPackage",
            config: {},
        };
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let component: Component;

        async function createContainer(): Promise<Container> {
            const factory = new PrimedComponentFactory(PrimedType, Component, []);
            const loader: ILoader = createLocalLoader([[ codeDetails, factory ]], deltaConnectionServer);
            return initializeLocalContainer(id, loader, codeDetails);
        }

        async function getComponent(componentId: string, container: Container): Promise<Component> {
            const response = await container.request({ url: componentId });
            if (response.status !== 200 || response.mimeType !== "fluid/component") {
                throw new Error(`Component with id: ${componentId} not found`);
            }
            return response.value as Component;
        }

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();

            const container = await createContainer();
            component = await getComponent("default", container);
        });

        it("Blob support", async () => {
            const handle = await component.writeBlob("aaaa");
            assert(await handle.get() === "aaaa", "Could not write blob to component");
            component.root.set("key", handle);

            const handle2 = component.root.get<IComponentHandle<string>>("key");
            const value2 = await handle2.get();
            assert(value2 === "aaaa", "Could not get blob from shared object in the component");

            const container2 = await createContainer();
            const component2 = await getComponent("default", container2);
            const value = await component2.root.get<IComponentHandle<string>>("key").get();
            assert(value === "aaaa", "Blob value not synced across containers");
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });
});
