/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { DataObjectFactory } from "@fluidframework/aqueduct/internal";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import type {
	IContainerRuntimeBaseExperimental,
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStorePolicies,
} from "@fluidframework/runtime-definitions/internal";
import {
	getContainerEntryPointBackCompat,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";
import * as semver from "semver";

describeCompat(
	"StagingMode: readonlyInStagingMode",
	"FullCompat",
	function (getTestObjectProvider, apis) {
		const createContainer = async ({
			test,
			readonlyInStagingMode,
		}: {
			test: Mocha.Context;
			readonlyInStagingMode: IFluidDataStorePolicies["readonlyInStagingMode"];
		}) => {
			const provider = getTestObjectProvider();

			// the readonlyInStagingMode support was added to the data store context
			// in the containerRuntime package in 2.40.0, so ensure it is at least
			// that version.
			// we also only run on local server, as other drivers are un-interesting
			// in regards to the behavior under test, as there is no server involvement
			//
			if (
				semver.compare(apis.containerRuntime.version, "2.40.0") === -1 ||
				provider.driver.type !== "local"
			) {
				test.skip();
			}

			const defaultFactory = new DataObjectFactory({
				type: "test",
				ctor: class extends apis.dataRuntime.DataObject implements ITestDataObject {
					get _context(): IFluidDataStoreContext {
						return this.context;
					}
					get _runtime(): IFluidDataStoreRuntime {
						return this.runtime;
					}
					get _root(): ISharedDirectory {
						return this.root;
					}
				},
				runtimeClass: apis.dataRuntime.FluidDataStoreRuntime,
				policies: {
					readonlyInStagingMode,
				},
			});
			const container = await provider.createContainer(
				new apis.containerRuntime.ContainerRuntimeFactoryWithDefaultDataStore({
					defaultFactory,
					registryEntries: new Map([[defaultFactory.type, defaultFactory]]),
				}),
			);
			const { _context, _runtime, _root } =
				await getContainerEntryPointBackCompat<ITestDataObject>(container);

			const containerRuntime = _context.containerRuntime as IContainerRuntimeBaseExperimental;
			return {
				container,
				containerRuntime,
				dsRuntime: _runtime as unknown as IFluidDataStoreChannel & IFluidDataStoreRuntime,
				shareDir: _root,
			};
		};

		for (const readonlyInStagingMode of ["yes"] as const) {
			it(`should set runtime to readonly when readonlyInStagingMode: ${readonlyInStagingMode}`, async function () {
				const { containerRuntime, dsRuntime } = await createContainer({
					test: this,
					readonlyInStagingMode,
				});

				assert.equal(
					dsRuntime.isReadOnly(),
					false,
					"Runtime should not be readonly before entering staging mode.",
				);

				const controls = containerRuntime.enterStagingMode?.();

				assert.equal(
					dsRuntime.isReadOnly(),
					true,
					"Runtime should be readonly after entering staging mode.",
				);

				controls?.commitChanges();

				assert.equal(
					dsRuntime.isReadOnly(),
					false,
					"Runtime should not be readonly after committing changes.",
				);
			});

			it(`should preserve readonly state when set before entering staging mode with readonlyInStagingMode: ${readonlyInStagingMode}`, async function () {
				const { container, containerRuntime, dsRuntime } = await createContainer({
					test: this,
					readonlyInStagingMode,
				});

				container.forceReadonly?.(true);

				assert.equal(
					dsRuntime.isReadOnly(),
					true,
					"Runtime should preserve readonly state set before entering staging mode.",
				);

				const controls = containerRuntime.enterStagingMode?.();

				assert.equal(
					dsRuntime.isReadOnly(),
					true,
					"Runtime should be readonly after entering staging mode.",
				);

				controls?.commitChanges();

				assert.equal(
					dsRuntime.isReadOnly(),
					true,
					"Runtime should preserve readonly state set before entering staging mode.",
				);
			});

			it(`should preserve readonly state when set during staging mode with readonlyInStagingMode: ${readonlyInStagingMode}`, async function () {
				const { container, containerRuntime, dsRuntime } = await createContainer({
					test: this,
					readonlyInStagingMode,
				});

				assert.equal(
					dsRuntime.isReadOnly(),
					false,
					"Runtime should not be readonly before entering staging mode.",
				);

				const controls = containerRuntime.enterStagingMode?.();

				container.forceReadonly?.(true);

				assert.equal(
					dsRuntime.isReadOnly(),
					true,
					"Runtime should preserve readonly state set during staging mode.",
				);

				controls?.commitChanges();

				assert.equal(
					dsRuntime.isReadOnly(),
					true,
					"Runtime should preserve readonly state set during staging mode.",
				);
			});
		}
		it("should not set runtime to readonly when readonlyInStagingMode: no", async function () {
			const { containerRuntime, dsRuntime } = await createContainer({
				test: this,
				readonlyInStagingMode: "no",
			});

			assert.equal(
				dsRuntime.isReadOnly(),
				false,
				"Runtime should not be readonly before entering staging mode.",
			);

			const controls = containerRuntime.enterStagingMode?.();

			assert.equal(
				dsRuntime.isReadOnly(),
				dsRuntime.policies === undefined,
				"Runtime should not be readonly when readonlyInStagingMode is false.",
			);

			controls?.commitChanges();

			assert.equal(
				dsRuntime.isReadOnly(),
				false,
				"Runtime should not be readonly after committing changes.",
			);
		});

		it("should allow changes readonlyInStagingMode: no", async function () {
			const { container, containerRuntime, shareDir } = await createContainer({
				test: this,
				readonlyInStagingMode: "no",
			});

			const controls = containerRuntime.enterStagingMode?.();

			shareDir.set("test", "test");

			controls?.commitChanges();

			if (container.isDirty) {
				await timeoutPromise((resolve) => {
					container.once("saved", () => resolve());
				});
			}
		});

		itExpects(
			"should log on changes when readonlyInStagingMode: yes",
			[{ eventName: "DataStoreMessageWhileReadonly", category: "generic" }],
			async function () {
				const { container, containerRuntime, shareDir } = await createContainer({
					test: this,
					readonlyInStagingMode: "yes",
				});

				const controls = containerRuntime.enterStagingMode?.();

				shareDir.set("test", "test");

				controls?.commitChanges();

				if (container.isDirty) {
					await timeoutPromise((resolve) => {
						container.once("saved", () => resolve());
					});
				}
			},
		);
	},
);
