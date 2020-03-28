/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

import assert from "assert";
import { EventEmitter } from "events";

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    IComponentDiscoverableInterfaces,
    IComponentDiscoverInterfaces,
} from "@microsoft/fluid-framework-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";

import { MatchMaker } from "../src/containerServices";

class MockComponentDiscoverProvider extends EventEmitter implements IComponentDiscoverInterfaces {
    public get IComponentDiscoverInterfaces() { return this; }

    public constructor(
        public readonly interfacesToDiscover: (keyof IComponent)[],
    ) {
        super();
    }

    public notifyComponentsDiscovered(interfaceName: keyof IComponent, components: readonly IComponent[]) {
        this.emit("discovered", interfaceName, components);
    }
}

class MockComponentDiscoverableInterfaces implements IComponentDiscoverableInterfaces {
    public get IComponentDiscoverableInterfaces() { return this; }

    // Note these have to exist to hack our way through the type check assert
    public get [IComponentLoadable]() { return this; }
    public get IComponentHandle() { return this; }

    public constructor(
        public readonly discoverableInterfaces: (keyof IComponent)[],
    ) {}
}

class MockComponentDiscoverableAndDiscoverInterfaces
    extends MockComponentDiscoverProvider implements IComponentDiscoverableInterfaces
{
    public get IComponentDiscoverableInterfaces() { return this; }

    // Note these have to exist to hack our way through the type check assert
    public get [IComponentLoadable]() { return this; }

    public constructor(
        public readonly discoverableInterfaces: (keyof IComponent)[],
        public readonly interfacesToDiscover: (keyof IComponent)[],
    ) {
        super(interfacesToDiscover);
    }
}

describe("Routerlicious", () => {
    describe("Aqueduct", () => {
        describe("MatchMaker", () => {
            it(`MatchMaker register discoverable after discover`, async () => {
                const matchMaker = new MatchMaker({} as IHostRuntime);
                const discoverProvider = new MockComponentDiscoverProvider(["IComponentLoadable"]);
                let discovered = false;
                discoverProvider.on("discovered", () => {
                    discovered = true;
                });

                matchMaker.registerComponentInterfaces(discoverProvider);

                const discoverableProvider = new MockComponentDiscoverableInterfaces(["IComponentLoadable"]);
                matchMaker.registerComponentInterfaces(discoverableProvider);
                assert(discovered, "discovered");
            });

            it(`MatchMaker register discover after discoverable`, async () => {
                const matchMaker = new MatchMaker({} as IHostRuntime);

                const discoverableProvider = new MockComponentDiscoverableInterfaces(["IComponentLoadable"]);
                matchMaker.registerComponentInterfaces(discoverableProvider);

                const discoverProvider = new MockComponentDiscoverProvider(["IComponentLoadable"]);
                let discovered = false;
                discoverProvider.on("discovered", (name, components) => {
                    if (components[0] === discoverableProvider) {
                        discovered = true;
                    }
                });

                matchMaker.registerComponentInterfaces(discoverProvider);

                assert(discovered, "discovered");
            });

            it(`MatchMaker register multiple discoverable`, async () => {
                const matchMaker = new MatchMaker({} as IHostRuntime);

                const discoverableProvider1 = new MockComponentDiscoverableInterfaces(["IComponentLoadable"]);
                matchMaker.registerComponentInterfaces(discoverableProvider1);

                const discoverableProvider2 = new MockComponentDiscoverableInterfaces(["IComponentLoadable"]);
                matchMaker.registerComponentInterfaces(discoverableProvider2);

                const discoverProvider = new MockComponentDiscoverProvider(["IComponentLoadable"]);
                let discovered = 0;
                discoverProvider.on("discovered", (interfaceName, components: readonly IComponent[]) => {
                    discovered = components.length;
                });

                matchMaker.registerComponentInterfaces(discoverProvider);

                assert(discovered === 2, "discovered");
            });

            it(`MatchMaker register discover after discoverable multiple interfaces`, async () => {
                const matchMaker = new MatchMaker({} as IHostRuntime);

                const discoverableProvider =
                    new MockComponentDiscoverableInterfaces(["IComponentLoadable", "IComponentHandle"]);
                matchMaker.registerComponentInterfaces(discoverableProvider);

                const discoverProvider = new MockComponentDiscoverProvider(["IComponentLoadable", "IComponentHandle"]);

                let discoveredLoadable = false;
                let discoveredHandle = false;
                discoverProvider.on("discovered", (interfaceName) => {
                    if (interfaceName === "IComponentLoadable") {
                        discoveredLoadable = true;
                    } else if (interfaceName === "IComponentHandle") {
                        discoveredHandle = true;
                    }
                });

                matchMaker.registerComponentInterfaces(discoverProvider);

                assert(discoveredLoadable, "discovered IComponentLoadable");
                assert(discoveredHandle, "discovered IComponentHandle");
            });

            it(`Registering interface without implementing throws`, async () => {
                const matchMaker = new MatchMaker({} as IHostRuntime);

                const discoverableProvider =
                    new MockComponentDiscoverableInterfaces(["IComponentRegistry"]);

                assert.throws(() => matchMaker.registerComponentInterfaces(discoverableProvider), "assert thrown");
            });

            it(`Can register for both Discover and Discoverable`, async () => {
                const matchMaker = new MatchMaker({} as IHostRuntime);

                const discoverableProvider = new MockComponentDiscoverableInterfaces(["IComponentHandle"]);
                matchMaker.registerComponentInterfaces(discoverableProvider);

                const discoverableAndDiscoverProvider =
                    new MockComponentDiscoverableAndDiscoverInterfaces(
                        ["IComponentLoadable"], // discoverable
                        ["IComponentHandle"], // discover
                    );

                let discovered1 = false;
                discoverableAndDiscoverProvider.on("discovered", (name, components) => {
                    if (name === "IComponentHandle" && components[0] === discoverableProvider) {
                        discovered1 = true;
                    }
                });

                matchMaker.registerComponentInterfaces(discoverableAndDiscoverProvider);

                const discoverProvider = new MockComponentDiscoverProvider(["IComponentLoadable"]);
                let discovered2 = false;
                discoverProvider.on("discovered", (name, components) => {
                    if (components[0] === discoverableAndDiscoverProvider) {
                        discovered2 = true;
                    }
                });

                matchMaker.registerComponentInterfaces(discoverProvider);

                assert(discovered1, "discoverableIComponentHandle");
                assert(discovered2, "discoverableIComponentLoadable");
            });

            it(`When registering for Discover and Discoverable does not alert discover of itself`, async () => {
                const matchMaker = new MatchMaker({} as IHostRuntime);

                const discoverableAndDiscoverProvider =
                    new MockComponentDiscoverableAndDiscoverInterfaces(
                        ["IComponentLoadable"], // discoverable
                        ["IComponentLoadable"], // discover
                    );

                let discovered = false;
                discoverableAndDiscoverProvider.on("discovered", (name, components) => {
                    discovered = true;
                });

                matchMaker.registerComponentInterfaces(discoverableAndDiscoverProvider);

                assert(!discovered, "shouldn't be discovered");
            });
        });
    });
});
