/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";

import {
    IComponentConfiguration,
    IComponentLoadable,
} from "@microsoft/fluid-component-core-interfaces";

import { DependencyContainer } from "../";

export interface IFoo {
    foo: string;
}

export class Foo {
    public foo() {
        console.log("foo");
    }
}

class MockLoadable implements IComponentLoadable {
    public get IComponentLoadable() { return this; }
    public get url() { return "url123"; }
}

export class MockLoadableWithArgs implements IComponentLoadable {
    public constructor(public readonly url: string) { }
    public get IComponentLoadable() { return this; }
}

export class MockComponentConfiguration implements IComponentConfiguration {
    public get IComponentConfiguration() { return this; }
    public get canReconnect() { return false; }
    public get scopes() { return ["hello"]; }
}

describe("Routerlicious", () => {
    describe("Aqueduct", () => {
        describe("ContainerModules", () => {
            it(`One Optional Module registered via value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IComponentLoadable, mock);

                const s = dc.synthesize({IComponentLoadable}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is valid");
            });

            it(`One Optional Module registered via Promise value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IComponentLoadable, Promise.resolve(mock));

                const s = dc.synthesize({IComponentLoadable}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is valid");
            });

            it(`One Optional Module registered via factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = () => mock;
                dc.register(IComponentLoadable, factory);

                const s = dc.synthesize({IComponentLoadable}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is valid");
            });

            it(`One Optional Module registered via Promise factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = async () => mock;
                dc.register(IComponentLoadable, factory);

                const s = dc.synthesize({IComponentLoadable}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is valid");
            });

            // it(`One Optional Module registered via instance - lazy default`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {instance: MockLoadable});

            //     const s = vessel.synthesize({IComponentLoadable}, {});
            //     const s1 = vessel.synthesize({IComponentLoadable}, {});

            //     assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            //     assert(s.IComponentLoadable?.url === "url123", "IComponentLoadable is valid");
            //     assert(s.IComponentLoadable !== s1.IComponentLoadable, "Should not be a singleton");
            // });

            // it(`One Optional Module registered via instance - lazy true`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {instance: MockLoadable, lazy: true});

            //     const s = vessel.synthesize({IComponentLoadable}, {});
            //     const s1 = vessel.synthesize({IComponentLoadable}, {});

            //     assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            //     assert(s.IComponentLoadable?.url === "url123", "IComponentLoadable is valid");
            //     assert(s.IComponentLoadable !== s1.IComponentLoadable, "Should not be a singleton");
            // });

            // it(`One Optional Module registered via instance - lazy false`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {instance: MockLoadable, lazy: false});

            //     const s = vessel.synthesize({IComponentLoadable}, {});
            //     const s1 = vessel.synthesize({IComponentLoadable}, {});

            //     assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            //     assert(s.IComponentLoadable?.url === "url123", "IComponentLoadable is valid");
            //     assert(s.IComponentLoadable !== s1.IComponentLoadable, "Should not be a singleton");
            // });

            // it(`One Optional Module registered via singleton - lazy default`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {singleton: MockLoadable});

            //     const s = vessel.synthesize({IComponentLoadable}, {});
            //     const s1 = vessel.synthesize({IComponentLoadable}, {});

            //     assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            //     assert(s.IComponentLoadable?.url === "url123", "IComponentLoadable is valid");
            //     assert(s.IComponentLoadable === s1.IComponentLoadable, "Should be a singleton");
            // });

            // it(`One Optional Module registered via singleton - lazy true`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {singleton: MockLoadable, lazy: true});

            //     const s = vessel.synthesize({IComponentLoadable}, {});
            //     const s1 = vessel.synthesize({IComponentLoadable}, {});

            //     assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            //     assert(s.IComponentLoadable?.url === "url123", "IComponentLoadable is valid");
            //     assert(s.IComponentLoadable === s1.IComponentLoadable, "Should be a singleton");
            // });

            // it(`One Optional Module registered via singleton - lazy false`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {singleton: MockLoadable, lazy: false});

            //     const s = vessel.synthesize({IComponentLoadable}, {});
            //     const s1 = vessel.synthesize({IComponentLoadable}, {});

            //     assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            //     assert(s.IComponentLoadable?.url === "url123", "IComponentLoadable is valid");
            //     assert(s.IComponentLoadable === s1.IComponentLoadable, "Should be a singleton");
            // });

            // it(`One Required Module registered via value`, async () => {
            //     const vessel = new DependencyContainer();
            //     const mock = new MockLoadable();
            //     vessel.register(IComponentLoadable, {value: mock});

            //     const s = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     assert(s.IComponentLoadable, "Required IComponentLoadable was returned");
            //     assert(s.IComponentLoadable === mock, "Required IComponentLoadable is valid");
            // });

            // it(`One Required Module registered via factory`, async () => {
            //     const vessel = new DependencyContainer();
            //     const mock = new MockLoadable();
            //     vessel.register(IComponentLoadable, {factory: () => mock});

            //     const s = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     assert(s.IComponentLoadable, "Required IComponentLoadable was returned");
            //     assert(s.IComponentLoadable.url === mock.url, "Required IComponentLoadable is valid");
            // });

            // it(`One Required Module registered via instance - lazy default`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {instance: MockLoadable});

            //     const s = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     const s1 = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     assert(s.IComponentLoadable, "Required IComponentLoadable was returned");
            //     assert(s.IComponentLoadable.url === "url123", "Required IComponentLoadable is valid");
            //     assert(s.IComponentLoadable !== s1.IComponentLoadable, "Should not be a singleton");
            // });

            // it(`One Required Module registered via instance - lazy true`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {instance: MockLoadable, lazy: true});

            //     const s = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     const s1 = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     assert(s.IComponentLoadable, "Required IComponentLoadable was returned");
            //     assert(s.IComponentLoadable?.url === "url123", "Required IComponentLoadable is valid");
            //     assert(s.IComponentLoadable !== s1.IComponentLoadable, "Should not be a singleton");
            // });

            // it(`One Required Module registered via instance - lazy false`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {instance: MockLoadable, lazy: false});

            //     const s = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     const s1 = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     assert(s.IComponentLoadable, "Required IComponentLoadable was returned");
            //     assert(s.IComponentLoadable?.url === "url123", "Required IComponentLoadable is valid");
            //     assert(s.IComponentLoadable !== s1.IComponentLoadable, "Should not be a singleton");
            // });

            // it(`One Required Module registered via singleton - lazy default`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {singleton: MockLoadable});

            //     const s = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     const s1 = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     assert(s.IComponentLoadable, "Required IComponentLoadable was returned");
            //     assert(s.IComponentLoadable?.url === "url123", "Required IComponentLoadable is valid");
            //     assert(s.IComponentLoadable === s1.IComponentLoadable, "Should be a singleton");
            // });

            // it(`One Required Module registered via singleton - lazy true`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {singleton: MockLoadable, lazy: true});

            //     const s = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     const s1 = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     assert(s.IComponentLoadable, "Required IComponentLoadable was returned");
            //     assert(s.IComponentLoadable?.url === "url123", "Required IComponentLoadable is valid");
            //     assert(s.IComponentLoadable === s1.IComponentLoadable, "Should be a singleton");
            // });

            // it(`One Required Module registered via singleton - lazy false`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {singleton: MockLoadable, lazy: false});

            //     const s = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     const s1 = vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     );

            //     assert(s.IComponentLoadable, "Required IComponentLoadable was returned");
            //     assert(s.IComponentLoadable?.url === "url123", "Required IComponentLoadable is valid");
            //     assert(s.IComponentLoadable === s1.IComponentLoadable, "Should be a singleton");
            // });

            // it(`Two Optional Modules all registered`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     vessel.register(IComponentConfiguration, {value: new MockComponentConfiguration()});

            //     const s = vessel.synthesize(
            //         {IComponentLoadable, IComponentConfiguration}, {});
            //     assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            //     assert(s.IComponentConfiguration, "Optional IComponentConfiguration was registered");
            // });

            // it(`Two Optional Modules none registered`, async () => {
            //     const vessel = new DependencyContainer();
            //     const s = vessel.synthesize(
            //         {IComponentLoadable,IComponentConfiguration}, {});
            //     assert(!s.IComponentLoadable, "Optional IComponentLoadable was not registered");
            //     assert(!s.IComponentConfiguration, "Optional IComponentConfiguration was not registered");
            // });

            // it(`Two Optional Modules one registered`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     const s = vessel.synthesize(
            //         {IComponentLoadable,IComponentConfiguration}, {});
            //     assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            //     assert(!s.IComponentConfiguration, "Optional IComponentConfiguration was not registered");
            // });

            // it(`Two Required Modules all registered`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     vessel.register(IComponentConfiguration, {value: new MockComponentConfiguration()});

            //     const s = vessel.synthesize(
            //         {},
            //         {IComponentLoadable, IComponentConfiguration},
            //     );

            //     assert(s.IComponentLoadable, "Required IComponentLoadable was registered");
            //     assert(s.IComponentConfiguration, "Required IComponentConfiguration was registered");
            // });

            // it(`Required Module not registered should throw`, async () => {
            //     const vessel = new DependencyContainer();

            //     assert.throws(() => vessel.synthesize(
            //         {},
            //         {IComponentLoadable},
            //     ), Error);
            // });

            // it(`Optional Module found in Parent`, async () => {
            //     const parentVessel = new DependencyContainer();
            //     parentVessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     const vessel = new DependencyContainer(parentVessel);

            //     const s = vessel.synthesize({IComponentLoadable}, {});
            //     assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            // });

            // it(`Optional Modules found in Parent and Child`, async () => {
            //     const parentVessel = new DependencyContainer();
            //     parentVessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     const vessel = new DependencyContainer(parentVessel);
            //     vessel.register(IComponentConfiguration, {value: new MockComponentConfiguration()});

            //     const s = vessel.synthesize(
            //         {IComponentLoadable, IComponentConfiguration}, {});
            //     assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            // });

            // it(`Optional Module in Parent and Child. Resolves Child`, async () => {
            //     const parentVessel = new DependencyContainer();
            //     parentVessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     const vessel = new DependencyContainer(parentVessel);
            //     const childLoadableModule = new MockLoadable();
            //     vessel.register(IComponentLoadable, {value: childLoadableModule});

            //     const s = vessel.synthesize(
            //         {IComponentLoadable}, {});
            //     assert(s.IComponentLoadable === childLoadableModule, "Child Module loaded");
            // });

            // it(`Required Module found in Parent`, async () => {
            //     const parentVessel = new DependencyContainer();
            //     parentVessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     const vessel = new DependencyContainer(parentVessel);

            //     const s = vessel.synthesize({}, {IComponentLoadable});
            //     assert(s.IComponentLoadable, "Required IComponentLoadable was registered");
            // });

            // it(`Required Module found in Parent and Child`, async () => {
            //     const parentVessel = new DependencyContainer();
            //     parentVessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     const vessel = new DependencyContainer(parentVessel);
            //     vessel.register(IComponentConfiguration, {value: new MockComponentConfiguration()});

            //     const s = vessel.synthesize(
            //         {}, {IComponentLoadable, IComponentConfiguration});
            //     assert(s.IComponentLoadable, "Required IComponentLoadable was registered");
            //     assert(s.IComponentConfiguration, "Required IComponentConfiguration was registered");
            // });

            // it(`Required Module in Parent and Child. Resolves Child`, async () => {
            //     const parentVessel = new DependencyContainer();
            //     parentVessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     const vessel = new DependencyContainer(parentVessel);
            //     const mock = new MockLoadable();
            //     vessel.register(IComponentLoadable, {value: mock});

            //     const s = vessel.synthesize(
            //         {}, {IComponentLoadable});
            //     assert(s.IComponentLoadable === mock, "Child Module loaded");
            // });

            // it(`Registering`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     assert(vessel.has(IComponentLoadable), "Manager has IComponentLoadable");
            //     assert(Array.from(vessel.registeredTypes).length === 1, "Manager has one module");
            // });

            // it(`Registering the same type twice throws`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     assert.throws(() => vessel.register(IComponentLoadable, {value: new MockLoadable()}), Error);
            // });

            // it(`Registering then Unregistering`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     vessel.unregister(IComponentLoadable);
            //     assert(!vessel.has(IComponentLoadable), "Manager doesn't have IComponentLoadable");
            //     assert(Array.from(vessel.registeredTypes).length === 0, "Manager has no modules");
            // });

            // it(`Registering then Unregistering then registering`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     vessel.unregister(IComponentLoadable);
            //     vessel.register(IComponentLoadable, {value: new MockLoadable()});
            //     assert(vessel.has(IComponentLoadable), "Manager has IComponentLoadable");
            // });

            // it(`has() resolves correctly in all variations`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {instance: MockLoadable});
            //     vessel.register(IComponentConfiguration, {instance: MockComponentConfiguration});
            //     assert(vessel.has(IComponentLoadable), "Manager has IComponentLoadable");
            //     assert(vessel.has(IComponentConfiguration), "Manager has IComponentConfiguration");
            //     assert(
            //         vessel.has(IComponentLoadable, IComponentConfiguration),
            //         "Manager has IComponentLoadable & IComponentConfiguration");
            //     assert(Array.from(vessel.registeredTypes).length === 2, "Manager has two modules");
            // });

            // it(`registeredModules() resolves correctly`, async () => {
            //     const vessel = new DependencyContainer();
            //     vessel.register(IComponentLoadable, {instance: MockLoadable});
            //     vessel.register(IComponentConfiguration, {instance: MockComponentConfiguration});
            //     const modules = Array.from(vessel.registeredTypes);
            //     assert(modules.length === 2, "Manager has two modules");
            //     assert(modules.includes(IComponentLoadable), "Manager has IComponentLoadable");
            //     assert(modules.includes(IComponentConfiguration), "Manager has IComponentConfiguration");
            // });
        });
    });
});
