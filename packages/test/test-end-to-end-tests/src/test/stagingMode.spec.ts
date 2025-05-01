/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import type {
	IContainerRuntimeBaseExperimental,
	IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions/internal";
import { getContainerEntryPointBackCompat } from "@fluidframework/test-utils/internal";
import * as semver from "semver";

describeCompat("StagingMode", "FullCompat", (getTestObjectProvider, apis) => {
	beforeEach(function () {
		if (semver.compare(apis.containerRuntime.version, "2.40.0") === -1) {
			return this.skip();
		}
	});

	it("should set runtime to readonly when readonlyInStagingMode is true", async function () {
		const provider = getTestObjectProvider();

		const container = await provider.makeTestContainer({
			policies: { readonlyInStagingMode: true },
		});
		const { _context, _runtime } =
			await getContainerEntryPointBackCompat<ITestDataObject>(container);

		const expRuntime = _context.containerRuntime as IContainerRuntimeBaseExperimental;

		assert.equal(
			_runtime.isReadOnly(),
			false,
			"Runtime should not be readonly before entering staging mode.",
		);

		const controls = expRuntime.enterStagingMode?.();

		assert.equal(
			_runtime.isReadOnly(),
			true,
			"Runtime should be readonly after entering staging mode.",
		);

		controls?.commitChanges();

		assert.equal(
			_runtime.isReadOnly(),
			false,
			"Runtime should not be readonly after committing changes.",
		);
	});

	it("should preserve readonly state when set before entering staging mode", async function () {
		const provider = getTestObjectProvider();

		const container = await provider.makeTestContainer({
			policies: { readonlyInStagingMode: true },
		});
		const { _context, _runtime } =
			await getContainerEntryPointBackCompat<ITestDataObject>(container);

		const expRuntime = _context.containerRuntime as IContainerRuntimeBaseExperimental;

		container.forceReadonly?.(true);

		assert.equal(
			_runtime.isReadOnly(),
			true,
			"Runtime should preserve readonly state set before entering staging mode.",
		);

		const controls = expRuntime.enterStagingMode?.();

		assert.equal(
			_runtime.isReadOnly(),
			true,
			"Runtime should be readonly after entering staging mode.",
		);

		controls?.commitChanges();

		assert.equal(
			_runtime.isReadOnly(),
			true,
			"Runtime should preserve readonly state set before entering staging mode.",
		);
	});

	it("should preserve readonly state when set during staging mode", async function () {
		const provider = getTestObjectProvider();

		const container = await provider.makeTestContainer({
			policies: { readonlyInStagingMode: true },
		});
		const { _context, _runtime } =
			await getContainerEntryPointBackCompat<ITestDataObject>(container);

		const expRuntime = _context.containerRuntime as IContainerRuntimeBaseExperimental;

		assert.equal(
			_runtime.isReadOnly(),
			false,
			"Runtime should not be readonly before entering staging mode.",
		);

		const controls = expRuntime.enterStagingMode?.();

		container.forceReadonly?.(true);

		assert.equal(
			_runtime.isReadOnly(),
			true,
			"Runtime should preserve readonly state set during staging mode.",
		);

		controls?.commitChanges();

		assert.equal(
			_runtime.isReadOnly(),
			true,
			"Runtime should preserve readonly state set during staging mode.",
		);
	});

	it("should not set runtime to readonly when readonlyInStagingMode is false", async function () {
		const provider = getTestObjectProvider();

		const container = await provider.makeTestContainer({
			policies: { readonlyInStagingMode: false },
		});
		const { _context, _runtime } =
			await getContainerEntryPointBackCompat<ITestDataObject>(container);

		const runtimeAsChannel = _runtime as unknown as IFluidDataStoreChannel;

		const expRuntime = _context.containerRuntime as IContainerRuntimeBaseExperimental;

		assert.equal(
			_runtime.isReadOnly(),
			false,
			"Runtime should not be readonly before entering staging mode.",
		);

		const controls = expRuntime.enterStagingMode?.();

		assert.equal(
			_runtime.isReadOnly(),
			runtimeAsChannel.policies === undefined,
			"Runtime should not be readonly when readonlyInStagingMode is false.",
		);

		controls?.commitChanges();

		assert.equal(
			_runtime.isReadOnly(),
			false,
			"Runtime should not be readonly after committing changes.",
		);
	});
});
