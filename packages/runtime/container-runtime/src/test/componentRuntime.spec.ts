/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IComponentRuntime, IComponentRegistry, IComponentFactory, IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { ComponentRuntime, ISharedObjectRegistry } from "@microsoft/fluid-component-runtime";
import { ContainerRuntime } from "..";
import { LocalComponentContext } from "../componentContext";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { IQuorum } from "@microsoft/fluid-protocol-definitions";
import { IAudience } from "@microsoft/fluid-container-definitions";
import * as assert from "assert";

describe("Component Runtime", () => {

    let localComponentContext: LocalComponentContext;
    let storage: IDocumentStorageService;
    let scope: IComponent;
    const attachCb = (mR: IComponentRuntime) => {};
    let containerRuntime: ContainerRuntime;
    let registry: IComponentRegistry;
    let factory: IComponentFactory;
    let sharedObjectFactory: ISharedObjectFactory;
    let sharedObjectRegistry: ISharedObjectRegistry;
    let quorum: IQuorum;
    let audience: IAudience;

    beforeEach(async () => {
        factory = {
            get IComponentFactory() { return factory; },
            instantiateComponent: (context: IComponentContext) => { },
        };
        registry = {
            IComponentRegistry: registry,
            get: (pkg) => Promise.resolve(factory),
        };
        sharedObjectRegistry = {
            get: (name) => sharedObjectFactory,
        }
    });

    it("Initialize component runtime", async () => {
        containerRuntime = {
            IComponentRegistry: registry,
            getQuorum: () => quorum,
            getAudience: () => audience,
            getComponentRuntime: (id) =>  {
                const compRuntimeP = localComponentContext.realize();
                ComponentRuntime.load(localComponentContext, sharedObjectRegistry, (runtime) => {}, registry);
                return compRuntimeP;
            }
        } as ContainerRuntime;
        localComponentContext =
        new LocalComponentContext("Test1", ["TestComponent1"], containerRuntime, storage, scope, attachCb);
        const compRuntime: IComponentRuntime = await localComponentContext.getComponentRuntime("Test1", true);
        assert.equal(compRuntime.id, "Test1", "Component Id is not matching.");
    });
});
