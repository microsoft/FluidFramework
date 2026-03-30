/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDataObject, describeCompat, itExpects } from "@fluid-private/test-version-utils";
import {
	BaseContainerRuntimeFactoryAlpha,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import {
	asLegacyAlpha,
	type ContainerRuntimeBaseAlpha,
	type IFluidDataStoreChannel,
	type IFluidDataStoreContext,
	type IFluidDataStoreFactory,
	type IFluidDataStorePolicies,
	type IStagingController,
	type NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import {
	getContainerEntryPointBackCompat,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";
import * as semver from "semver";

/**
 * Local factory that extends BaseContainerRuntimeFactoryAlpha to expose
 * IStagingController. Mirrors the default-data-store setup from
 * ContainerRuntimeFactoryWithDefaultDataStore.
 */
class TestContainerRuntimeFactory extends BaseContainerRuntimeFactoryAlpha {
	private readonly defaultFactory: IFluidDataStoreFactory;

	public constructor(
		defaultFactory: IFluidDataStoreFactory,
		registryEntries: NamedFluidDataStoreRegistryEntries,
	) {
		super({
			registryEntries,
			provideEntryPoint: async (runtime) => {
				const entryPoint = await runtime.getAliasedDataStoreEntryPoint("default");
				if (entryPoint === undefined) {
					throw new Error("default dataStore must exist");
				}
				return entryPoint.get();
			},
		});
		this.defaultFactory = defaultFactory;
	}

	protected override async containerInitializingFirstTime(
		runtime: IContainerRuntime,
	): Promise<void> {
		const dataStore = await runtime.createDataStore(this.defaultFactory.type);
		await dataStore.trySetAlias("default");
	}
}

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
		}): Promise<{
			container: IContainer;
			containerRuntime: ContainerRuntimeBaseAlpha;
			enterStagingMode: () => void;
			exitStagingMode: (action: "commit" | "discard") => void;
			dsRuntime: IFluidDataStoreChannel & IFluidDataStoreRuntime;
			shareDir: ISharedDirectory;
		}> => {
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

			const runtimeFactory = new TestContainerRuntimeFactory(
				defaultFactory,
				new Map([[defaultFactory.type, defaultFactory]]),
			);
			const container = await provider.createContainer(runtimeFactory);
			const { _context, _runtime, _root } =
				await getContainerEntryPointBackCompat<ITestDataObject>(container);

			const containerRuntime = asLegacyAlpha(_context.containerRuntime);

			// Skip if the runtime doesn't support staging mode — IStagingController is only
			// available from factories that use loadContainerRuntimeAlpha, which in turn
			// requires a runtime new enough to support staging mode.
			const stagingController: IStagingController | undefined =
				runtimeFactory.stagingController;
			if (stagingController === undefined) {
				test.skip();
				// Unreachable at runtime (test.skip() throws), but needed for TypeScript narrowing.
				return undefined as never;
			}

			return {
				container,
				containerRuntime,
				enterStagingMode: () => stagingController.enterStagingMode(),
				exitStagingMode: (action: "commit" | "discard") =>
					stagingController.exitStagingMode(action),
				dsRuntime: _runtime as unknown as IFluidDataStoreChannel & IFluidDataStoreRuntime,
				shareDir: _root,
			};
		};

		it(`should set runtime to readonly when readonlyInStagingMode: true`, async function () {
			const { enterStagingMode, exitStagingMode, dsRuntime } = await createContainer({
				test: this,
				readonlyInStagingMode: true,
			});

			assert.equal(
				dsRuntime.isReadOnly(),
				false,
				"Runtime should not be readonly before entering staging mode.",
			);

			enterStagingMode();

			assert.equal(
				dsRuntime.isReadOnly(),
				true,
				"Runtime should be readonly after entering staging mode.",
			);

			exitStagingMode("commit");

			assert.equal(
				dsRuntime.isReadOnly(),
				false,
				"Runtime should not be readonly after committing changes.",
			);
		});

		it(`should preserve readonly state when set before entering staging mode with readonlyInStagingMode: true`, async function () {
			const { container, enterStagingMode, exitStagingMode, dsRuntime } =
				await createContainer({
					test: this,
					readonlyInStagingMode: true,
				});

			container.forceReadonly?.(true);

			assert.equal(
				dsRuntime.isReadOnly(),
				true,
				"Runtime should preserve readonly state set before entering staging mode.",
			);

			enterStagingMode();

			assert.equal(
				dsRuntime.isReadOnly(),
				true,
				"Runtime should be readonly after entering staging mode.",
			);

			exitStagingMode("commit");

			assert.equal(
				dsRuntime.isReadOnly(),
				true,
				"Runtime should preserve readonly state set before entering staging mode.",
			);
		});

		it(`should preserve readonly state when set during staging mode with readonlyInStagingMode: true`, async function () {
			const { container, enterStagingMode, exitStagingMode, dsRuntime } =
				await createContainer({
					test: this,
					readonlyInStagingMode: true,
				});

			assert.equal(
				dsRuntime.isReadOnly(),
				false,
				"Runtime should not be readonly before entering staging mode.",
			);

			enterStagingMode();

			container.forceReadonly?.(true);

			assert.equal(
				dsRuntime.isReadOnly(),
				true,
				"Runtime should preserve readonly state set during staging mode.",
			);

			exitStagingMode("commit");

			assert.equal(
				dsRuntime.isReadOnly(),
				true,
				"Runtime should preserve readonly state set during staging mode.",
			);
		});

		it("should not set runtime to readonly when readonlyInStagingMode: false", async function () {
			const { enterStagingMode, exitStagingMode, dsRuntime } = await createContainer({
				test: this,
				readonlyInStagingMode: false,
			});

			assert.equal(
				dsRuntime.isReadOnly(),
				false,
				"Runtime should not be readonly before entering staging mode.",
			);

			enterStagingMode();

			assert.equal(
				dsRuntime.isReadOnly(),
				dsRuntime.policies === undefined,
				"Runtime should not be readonly when readonlyInStagingMode is false.",
			);

			exitStagingMode("commit");

			assert.equal(
				dsRuntime.isReadOnly(),
				false,
				"Runtime should not be readonly after committing changes.",
			);
		});

		it("should allow changes readonlyInStagingMode: false", async function () {
			const { container, enterStagingMode, exitStagingMode, shareDir } = await createContainer(
				{
					test: this,
					readonlyInStagingMode: false,
				},
			);

			enterStagingMode();

			shareDir.set("test", "test");

			exitStagingMode("commit");

			if (container.isDirty) {
				await timeoutPromise((resolve) => {
					container.once("saved", () => resolve());
				});
			}
		});

		itExpects(
			"should log on changes when readonlyInStagingMode: true",
			[
				{
					eventName: "fluid:telemetry:FluidDataStoreContext:DataStoreMessageWhileReadonly",
					category: "generic",
				},
			],
			async function () {
				const { container, enterStagingMode, exitStagingMode, shareDir } =
					await createContainer({
						test: this,
						readonlyInStagingMode: true,
					});

				enterStagingMode();

				shareDir.set("test", "test");

				exitStagingMode("commit");

				if (container.isDirty) {
					await timeoutPromise((resolve) => {
						container.once("saved", () => resolve());
					});
				}
			},
		);
	},
);
