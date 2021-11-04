/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState, IContainerContext, IRuntime } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import Sinon from "sinon";
import { RuntimeFactoryHelper } from "../runtimeFactoryHelper";

class TestRuntimeFactoryHelper extends RuntimeFactoryHelper {
    constructor(
        private readonly runtime: IRuntime & IContainerRuntime,
    ) {
        super();
    }

    public async preInitialize(
        _context: IContainerContext,
        _existing: boolean,
    ): Promise<IRuntime & IContainerRuntime> {
        return this.runtime;
    }
}

describe("RuntimeFactoryHelper", () => {
    const sandbox: Sinon.SinonSandbox = Sinon.createSandbox();
    const context: Partial<IContainerContext> = {};
    const runtime: Partial<IRuntime & IContainerRuntime> = {};
    let helper: TestRuntimeFactoryHelper;
    let unit: Sinon.SinonMock;

    beforeEach(() => {
        helper = new TestRuntimeFactoryHelper(runtime as IRuntime & IContainerRuntime);
        unit = sandbox.mock(helper);
        unit.expects("preInitialize").once();
        unit.expects("hasInitialized").once();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("Instantiate when existing flag is `true`", async () => {
        unit.expects("instantiateFirstTime").never();
        unit.expects("instantiateFromExisting").once();
        const existingContext: Partial<IContainerContext> = {attachState: AttachState.Attached};
        await helper.instantiateRuntime(existingContext as IContainerContext);

        unit.verify();
    });

    it("Instantiate when existing flag is `false`", async () => {
        unit.expects("instantiateFirstTime").once();
        unit.expects("instantiateFromExisting").never();
        const existingContext: Partial<IContainerContext> = {attachState: AttachState.Detached};
        await helper.instantiateRuntime(existingContext as IContainerContext);

        unit.verify();
    });

    it("Instantiate when existing flag is unset", async () => {
        unit.expects("instantiateFirstTime").once();
        unit.expects("instantiateFromExisting").never();
        await helper.instantiateRuntime(context as IContainerContext);

        unit.verify();
    });

    it("Instantiate when existing flag is unset and context is existing", async () => {
        const existingContext: Partial<IContainerContext> = {attachState: AttachState.Attached};
        unit.expects("instantiateFirstTime").never();
        unit.expects("instantiateFromExisting").once();
        await helper.instantiateRuntime(existingContext as IContainerContext);

        unit.verify();
    });

    it("Instantiate when existing flag takes precedence over context", async () => {
        const existingContext: Partial<IContainerContext> = {attachState: AttachState.Attached};
        unit.expects("instantiateFirstTime").once();
        unit.expects("instantiateFromExisting").never();
        await helper.instantiateRuntime(existingContext as IContainerContext);

        unit.verify();
    });
});
