/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { ISharedDirectory } from "@fluidframework/map";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@fluidframework/test-utils";
import { compatTest } from "./compatUtils";

const PrimedType = "@fluidframework/primedComponent";

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

async function getComponent(componentId: string, container: Container): Promise<Component> {
    const response = await container.request({ url: componentId });
    if (response.status !== 200 || response.mimeType !== "fluid/component") {
        throw new Error(`Component with id: ${componentId} not found`);
    }
    return response.value as Component;
}

const tests = (makeTestContainer: () => Promise<Container>) => {
    let component: Component;

    beforeEach(async function() {
        const container = await makeTestContainer();
        component = await getComponent("default", container);
    });

    it("Blob support", async () => {
        const handle = await component.writeBlob("aaaa");
        assert(await handle.get() === "aaaa", "Could not write blob to component");
        component.root.set("key", handle);

        const handle2 = component.root.get<IComponentHandle<string>>("key");
        const value2 = await handle2.get();
        assert(value2 === "aaaa", "Could not get blob from shared object in the component");

        const container2 = await makeTestContainer();
        const component2 = await getComponent("default", container2);
        const value = await component2.root.get<IComponentHandle<string>>("key").get();
        assert(value === "aaaa", "Blob value not synced across containers");
    });
};

describe("PrimedComponent", () => {
    describe("Blob support", () => {
        const id = "fluid-test://localhost/primedComponentTest";
        const codeDetails: IFluidCodeDetails = {
            package: "primedComponentTestPackage",
            config: {},
        };
        let deltaConnectionServer: ILocalDeltaConnectionServer;

        async function createContainer(): Promise<Container> {
            const factory = new PrimedComponentFactory(PrimedType, Component, [], {});
            const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
            return initializeLocalContainer(id, loader, codeDetails);
        }

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
        });

        tests(createContainer);

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("compatibility", function() {
        compatTest(tests as any);
    });
});
