/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import Sinon from "sinon";

import { RuntimeFactoryHelper } from "../runtimeFactoryHelper.js";

class TestRuntimeFactoryHelper extends RuntimeFactoryHelper {
	public constructor(private readonly runtime: IRuntime & IContainerRuntime) {
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
		await helper.instantiateRuntime(context as IContainerContext, /* existing */ true);

		unit.verify();
	});

	it("Instantiate when existing flag is `false`", async () => {
		unit.expects("instantiateFirstTime").once();
		unit.expects("instantiateFromExisting").never();
		await helper.instantiateRuntime(context as IContainerContext, /* existing */ false);

		unit.verify();
	});
});
