/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { TestHost } from "@microsoft/fluid-local-test-utils";
import { ISharedDirectory } from "@microsoft/fluid-map";

const PrimedType = "@microsoft/fluid-primedComponent";

/**
 * My sample component
 */
class Component extends PrimedComponent {
    public get root(): ISharedDirectory {
        return super.root;
    }
    public async writeBlob(blob: string): Promise<IComponentHandle> {
        return super.writeBlob(blob);
    }
}

describe("PrimedComponent", () => {

    describe("Blob support", () => {
        const componentId = "id";
        let host: TestHost;
        let component: Component;

        beforeEach(async () => {
            const factory = new PrimedComponentFactory(Component, []);
            host = new TestHost([
                [PrimedType, Promise.resolve(factory)],
            ]);
            component = await host.createAndAttachComponent(componentId, PrimedType);
        });

        afterEach(async () => { await host.close(); });

        it("Blob support", async () => {
            const handle = await component.writeBlob("aaaa");
            assert(await handle.get<string>() === "aaaa");
            component.root.set("key", handle);

            const handle2 = component.root.get<IComponentHandle>("key");
            const value2 = await handle2.get<string>();
            assert(value2 === "aaaa");

            const host2 = host.clone();
            await TestHost.sync(host, host2);
            const component2 = await host2.getComponent<Component>(componentId);
            const value = await component2.root.get<IComponentHandle>("key").get<string>();
            assert(value === "aaaa");
            await host2.close();
        });
    });
});
