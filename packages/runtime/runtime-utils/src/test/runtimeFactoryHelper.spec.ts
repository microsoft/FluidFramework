/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainerContext, IRuntime } from "@fluidframework/container-definitions";
import Sinon from "sinon";
import { RuntimeFactoryHelper } from "../runtimeFactoryHelper";

class TestRuntimeFactoryHelper extends RuntimeFactoryHelper {
    constructor(
        private readonly runtime: IRuntime,
    ) {
        super();
    }

    private _preInitializedFlag: boolean = false;
    private _instatiatedFirstTimeFlag: boolean = false;
    private _instatiatedFromExistingFlag: boolean = false;
    private _hasInitializedFlag: boolean = false;

    public get preInitializedFlag(): boolean {
        return this._preInitializedFlag;
    }

    public get instatiatedFirstTimeFlag(): boolean {
        return this._instatiatedFirstTimeFlag;
    }

    public get instatiatedFromExistingFlag(): boolean {
        return this._instatiatedFromExistingFlag;
    }

    public get hasInitializedFlag(): boolean {
        return this._hasInitializedFlag;
    }

    public async preInitialize(_context: IContainerContext, _existing: boolean): Promise<IRuntime> {
        this._preInitializedFlag = true;
        return this.runtime;
    }

    public async instantiateFirstTime(_runtime: IRuntime): Promise<void> {
        this._instatiatedFirstTimeFlag = true;
    }

    public async instantiateFromExisting(_runtime: IRuntime): Promise<void> {
        this._instatiatedFromExistingFlag = true;
    }

    public async hasInitialized(_runtime: IRuntime): Promise<void> {
        this._hasInitializedFlag = true;
    }
}

describe("RuntimeFactoryHelper", () => {
    const sandbox: Sinon.SinonSandbox = Sinon.createSandbox();
    const context = (sandbox.stub() as unknown) as IContainerContext;
    const runtime = (sandbox.mock() as unknown) as IRuntime;
    let helper: TestRuntimeFactoryHelper;

    beforeEach(() => {
        helper = new TestRuntimeFactoryHelper(runtime);
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("Instantiate from existing when flag is set", async () => {
        const result = await helper.instantiateRuntime(context, /* existing */ true);

        assert.strictEqual(result, runtime);
        assert.ok(helper.preInitializedFlag);
        assert.ok(!helper.instatiatedFirstTimeFlag);
        assert.ok(helper.instatiatedFromExistingFlag);
        assert.ok(helper.hasInitializedFlag);
    });

    it("Instantiate from existing when flag takes precedence over context", async () => {
        const result = await helper.instantiateRuntime(context, /* existing */ false);

        assert.strictEqual(result, runtime);
        assert.ok(helper.preInitializedFlag);
        assert.ok(helper.instatiatedFirstTimeFlag);
        assert.ok(!helper.instatiatedFromExistingFlag);
        assert.ok(helper.hasInitializedFlag);
    });
});
