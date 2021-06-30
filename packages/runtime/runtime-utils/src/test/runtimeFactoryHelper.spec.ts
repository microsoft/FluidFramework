/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime } from "@fluidframework/container-definitions";
import Sinon from "sinon";
import { RuntimeFactoryHelper } from "../runtimeFactoryHelper";

class TestRuntimeFactoryHelper extends RuntimeFactoryHelper {
    constructor(
        private readonly runtime: IRuntime,
    ) {
        super();
    }

    public async preInitialize(_context: IContainerContext, _existing: boolean): Promise<IRuntime> {
        return this.runtime;
    }
}

describe("RuntimeFactoryHelper", () => {
    const sandbox: Sinon.SinonSandbox = Sinon.createSandbox();
    const context = (sandbox.stub() as unknown) as IContainerContext;
    const runtime = (sandbox.mock() as unknown) as IRuntime;
    let helper: TestRuntimeFactoryHelper;
    let unit: Sinon.SinonMock;

    beforeEach(() => {
        helper = new TestRuntimeFactoryHelper(runtime);
        unit = sandbox.mock(helper);
        unit.expects("preInitialize").once();
        unit.expects("hasInitialized").once();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("Instantiate from existing when existing flag is `true`", async () => {
        unit.expects("instantiateFirstTime").never();
        unit.expects("instantiateFromExisting").once();
        await helper.instantiateRuntime(context, /* existing */ true);

        unit.verify();
    });

    it("Instantiate from existing when existing flag is `false`", async () => {
        unit.expects("instantiateFirstTime").once();
        unit.expects("instantiateFromExisting").never();
        await helper.instantiateRuntime(context, /* existing */ false);

        unit.verify();
    });

    it("Instantiate from existing when existing flag is unset", async () => {
        unit.expects("instantiateFirstTime").once();
        unit.expects("instantiateFromExisting").never();
        await helper.instantiateRuntime(context);

        unit.verify();
    });
});
