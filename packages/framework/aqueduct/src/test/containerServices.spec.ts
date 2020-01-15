import * as assert from "assert";

import { InstanceContainerService, SingletonContainerService } from "../";
import { IComponentRouter, IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";

class ExampleServiceMock implements IComponentRouter {

    public get IComponentRouter() { return this; }

    request(request: IRequest): Promise<IResponse> {
        throw new Error("Method not implemented.");
    }
}

describe("Routerlicious", () => {
    describe("Aqueduct", () => {
        describe("SingletonContainerService", () => {
            describe("getComponent", () => {
                it("Two gets should return the same object", async () => {
                    const service = new SingletonContainerService("id", () => new ExampleServiceMock());

                    const component1 = service.getComponent({} as IHostRuntime);
                    const component2 = service.getComponent({} as IHostRuntime);

                    assert(component1 === component2, "Component objects are the same");
                });
            });
        });
        describe("InstanceContainerService", () => {
            describe("getComponent", () => {
                it("Two gets should return different objects", async () => {
                    const service = new InstanceContainerService("id", () => new ExampleServiceMock());

                    const component1 = service.getComponent({} as IHostRuntime);
                    const component2 = service.getComponent({} as IHostRuntime);

                    assert(component1 !== component2, "Component objects are different");
                });
            });
        });
    });
});
