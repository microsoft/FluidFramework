/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/component-core-interfaces";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { ISharedDirectory } from "@fluidframework/map";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@fluidframework/test-utils";
import { compatTest, ICompatTestArgs } from "./compatUtils";

const PrimedType = "@fluidframework/primedComponent";

/**
 * My sample component
 */
class Component extends DataObject {
    public get root(): ISharedDirectory {
        return super.root;
    }
    public async writeBlob(blob: string): Promise<IFluidHandle<string>> {
        return super.writeBlob(blob);
    }
}

async function requestFluidObject(componentId: string, container: Container): Promise<Component> {
    const response = await container.request({ url: componentId });
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Component with id: ${componentId} not found`);
    }
    return response.value as Component;
}

const tests = (args: ICompatTestArgs) => {
    let component: Component;

    beforeEach(async function() {
        const container = await args.makeTestContainer();
        component = await requestFluidObject("default", container as Container);
    });

    it("Blob support", async () => {
        const handle = await component.writeBlob("aaaa");
        assert(await handle.get() === "aaaa", "Could not write blob to component");
        component.root.set("key", handle);

        const handle2 = component.root.get<IFluidHandle<string>>("key");
        const value2 = await handle2.get();
        assert(value2 === "aaaa", "Could not get blob from shared object in the component");

        const container2 = await args.makeTestContainer();
        const component2 = await requestFluidObject("default", container2 as Container);
        const value = await component2.root.get<IFluidHandle<string>>("key").get();
        assert(value === "aaaa", "Blob value not synced across containers");
    });
};

describe("DataObject", () => {
    describe("Blob support", () => {
        const id = "fluid-test://localhost/primedComponentTest";
        const codeDetails: IFluidCodeDetails = {
            package: "primedComponentTestPackage",
            config: {},
        };
        let deltaConnectionServer: ILocalDeltaConnectionServer;

        async function makeTestContainer(): Promise<Container> {
            const factory = new DataObjectFactory(PrimedType, Component, [], {});
            const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
            return initializeLocalContainer(id, loader, codeDetails);
        }

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
        });

        tests({ makeTestContainer });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("compatibility", function() {
        compatTest(tests);
    });
});
