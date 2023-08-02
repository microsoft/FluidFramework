/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import {
	ContainerRuntime,
	IAckedSummary,
	SummaryCollection,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime";
import {
	IContainerRuntime,
	IDataStoreWithBindToContext_Deprecated,
} from "@fluidframework/container-runtime-definitions";
import { FluidObject, IFluidRouter } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ConfigTypes,
	IConfigProviderBase,
	createChildLogger,
} from "@fluidframework/telemetry-utils";
import {
	ITestFluidObject,
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
} from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluid-internal/test-version-utils";

describeFullCompat("Named root data stores", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	let container1: IContainer;
	let container2: IContainer;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;

	const packageName = "default";
	const IdleDetectionTime = 100;
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
			gcOptions: {
				gcAllowed: true,
			},
		},
	};

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => {
		return {
			getRawConfig: (name: string): ConfigTypes => settings[name],
		};
	};

	const setupContainers = async (
		containerConfig: ITestContainerConfig = testContainerConfig,
		featureGates: Record<string, ConfigTypes> = {},
	) => {
		provider.reset();
		const configWithFeatureGates = {
			...containerConfig,
			loaderProps: { configProvider: configProvider(featureGates) },
		};
		container1 = await provider.makeTestContainer(configWithFeatureGates);
		dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "/");

		container2 = await provider.loadTestContainer(configWithFeatureGates);
		dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "/");

		await provider.ensureSynchronized();
	};

	const reset = async () => provider.reset();

	const runtimeOf = (dataObject: ITestFluidObject): IContainerRuntime =>
		dataObject.context.containerRuntime as IContainerRuntime;

	const createDataStoreWithProps = async (dataObject: ITestFluidObject, id: string) =>
		runtimeOf(dataObject)._createDataStoreWithProps(packageName, {}, id);

	const getAliasedDataStoreEntryPoint = async (dataObject: ITestFluidObject, id: string) =>
		runtimeOf(dataObject).getAliasedDataStoreEntryPoint?.(id) ??
		runtimeOf(dataObject).getRootDataStore(id, false /* wait */);

	describe("Legacy APIs", () => {
		beforeEach(async () => setupContainers(testContainerConfig));
		afterEach(async () => reset());

		it("Datastore creation with legacy API returns datastore which can be aliased", async () => {
			const ds = await createDataStoreWithProps(dataObject1, "1");
			const aliasResult = await ds.trySetAlias("2");
			assert.equal(aliasResult, "Success");
		});
	});

	describe("Aliasing", () => {
		beforeEach(async () => setupContainers());
		afterEach(async () => reset());

		const alias = "alias";

		it("Assign multiple data stores to the same alias, first write wins, same container - detached", async () => {
			const loader = provider.makeTestLoader(testContainerConfig) as Loader;
			const container: IContainer = await loader.createDetachedContainer(
				provider.defaultCodeDetails,
			);
			const request = provider.driver.createCreateNewRequest(provider.documentId);
			const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
			const ds1 = await runtimeOf(dataObject).createDataStore(packageName);
			const ds2 = await runtimeOf(dataObject).createDataStore(packageName);

			const aliasResult1 = await ds1.trySetAlias(alias);
			const aliasResult2 = await ds2.trySetAlias(alias);

			assert.equal(aliasResult1, "Success");
			assert.equal(aliasResult2, "Conflict");

			assert.ok(await getAliasedDataStoreEntryPoint(dataObject, alias));

			await container.attach(request);
			const ds3 = await runtimeOf(dataObject).createDataStore(packageName);
			const aliasResult3 = await ds3.trySetAlias(alias);
			assert.equal(aliasResult3, "Conflict");
		});

		it("Assign multiple data stores to the same alias, first write wins, same container", async () => {
			const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
			const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);

			const aliasResult1 = await ds1.trySetAlias(alias);
			const aliasResult2 = await ds2.trySetAlias(alias);

			assert.equal(aliasResult1, "Success");
			assert.equal(aliasResult2, "Conflict");

			assert.ok(await getAliasedDataStoreEntryPoint(dataObject1, alias));
		});

		it("Aliases with slashes are not supported", async () => {
			const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);

			const wrongAlias = `${alias}/${alias}`;
			await assert.rejects(
				ds1.trySetAlias(wrongAlias),
				() => true,
				"Slashes should not be supported",
			);

			let dataStore: FluidObject | undefined;
			let error: unknown;
			try {
				dataStore = await getAliasedDataStoreEntryPoint(dataObject1, wrongAlias);
			} catch (e) {
				// back-compat - getRootDataStore throws an error if the data store doesn't exist.
				error = e;
			}
			assert(
				dataStore === undefined || error !== undefined,
				"The aliasing should not have happened",
			);
		});

		it("Aliasing a datastore is idempotent", async () => {
			const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);

			const aliasResult1 = await ds1.trySetAlias(alias);
			const aliasResult2 = await ds1.trySetAlias(alias);

			assert.equal(aliasResult1, "Success");
			assert.equal(aliasResult2, "Success");

			assert.ok(await getAliasedDataStoreEntryPoint(dataObject1, alias));
		});

		it("Aliasing a datastore while aliasing", async () => {
			const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
			const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);
			const ds3 = await runtimeOf(dataObject1).createDataStore(packageName);

			const alias1 = "alias1";
			const [aliasResult1, aliasResult2] = await Promise.all([
				ds1.trySetAlias(alias1),
				ds1.trySetAlias(alias1),
			]);

			assert.equal(aliasResult1, "Success");
			assert.equal(aliasResult2, "Success");
			assert.ok(await getAliasedDataStoreEntryPoint(dataObject1, alias1));

			const alias2 = "alias2";
			const [aliasResult3, aliasResult4] = await Promise.all([
				ds2.trySetAlias(alias2),
				ds2.trySetAlias(alias2 + alias2),
			]);

			assert.equal(aliasResult3, "Success");
			assert.equal(aliasResult4, "AlreadyAliased");
			assert.ok(await getAliasedDataStoreEntryPoint(dataObject1, alias2));

			const [aliasResult5, aliasResult6] = await Promise.all([
				ds3.trySetAlias(alias1),
				ds3.trySetAlias(alias1 + alias1),
			]);

			assert.equal(aliasResult5, "Conflict");
			assert.equal(aliasResult6, "AlreadyAliased");
		});

		it(
			"Trying to create multiple datastores aliased to the same value on the same client " +
				"will always return the same datastore",
			async () => {
				const datastores: IFluidRouter[] = [];
				const createAliasedDataStore = async () => {
					try {
						const datastore = await getAliasedDataStoreEntryPoint(dataObject1, alias);
						if (datastore === undefined) {
							throw new Error("Aliased data store doesn't exist yet");
						}
						return datastore;
					} catch (err) {
						const newDataStore = await runtimeOf(dataObject1).createDataStore(
							packageName,
						);
						datastores.push(newDataStore);
						await newDataStore.trySetAlias(alias);
						return getAliasedDataStoreEntryPoint(dataObject1, alias);
					}
				};

				await Promise.all([
					await createAliasedDataStore(),
					await createAliasedDataStore(),
					await createAliasedDataStore(),
					await createAliasedDataStore(),
				]);

				assert.equal(datastores.length, 1);
			},
		);

		it("Aliasing a datastore during an alias operation with the same name", async () => {
			const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
			const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);

			const [aliasResult1, aliasResult2] = await Promise.all([
				ds1.trySetAlias(alias),
				ds2.trySetAlias(alias),
			]);

			assert.equal(aliasResult1, "Success");
			assert.equal(aliasResult2, "Conflict");

			const [aliasResult3, aliasResult4] = await Promise.all([
				ds1.trySetAlias(alias + alias),
				ds2.trySetAlias(alias + alias),
			]);

			assert.equal(aliasResult3, "AlreadyAliased");
			assert.equal(aliasResult4, "Success");
		});

		it("Aliasing a previously aliased datastore will fail", async () => {
			const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);

			const aliasResult1 = await ds1.trySetAlias(alias);
			const aliasResult2 = await ds1.trySetAlias(alias + alias);

			assert.equal(aliasResult1, "Success");
			assert.equal(aliasResult2, "AlreadyAliased");

			assert.ok(await getAliasedDataStoreEntryPoint(dataObject1, alias));
		});

		it("Aliasing a datastore which previously failed to alias will succeed", async () => {
			const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
			const ds2 = await runtimeOf(dataObject1).createDataStore(packageName);

			const aliasResult1 = await ds1.trySetAlias(alias);
			const aliasResult2 = await ds2.trySetAlias(alias);
			const aliasResult3 = await ds2.trySetAlias(alias + alias);

			assert.equal(aliasResult1, "Success");
			assert.equal(aliasResult2, "Conflict");
			assert.equal(aliasResult3, "Success");

			assert.ok(await getAliasedDataStoreEntryPoint(dataObject1, alias));
		});

		it("Sending a bad alias message returns error", async () => {
			try {
				(runtimeOf(dataObject1) as ContainerRuntime).submitDataStoreAliasOp(
					{ id: alias },
					undefined,
				);
				assert.fail("Expected exception from sending invalid alias");
			} catch (err) {
				assert.equal((err as Error).message, "malformedDataStoreAliasMessage");
			}
		});

		it("Assign multiple data stores to the same alias, first write wins, different containers", async function () {
			const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
			const ds2 = await runtimeOf(dataObject2).createDataStore(packageName);

			const aliasResult1 = await ds1.trySetAlias(alias);
			const aliasResult2 = await ds2.trySetAlias(alias);

			assert.equal(aliasResult1, "Success");
			assert.equal(aliasResult2, "Conflict");

			await provider.ensureSynchronized();
			const container3 = await provider.loadTestContainer(testContainerConfig);
			const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "/");

			await provider.ensureSynchronized();
			assert.ok(await getAliasedDataStoreEntryPoint(dataObject3, alias));
		});

		it(
			"Assign multiple data stores to the same alias, first write wins, " +
				"different containers from snapshot",
			async () => {
				await setupContainers({
					...testContainerConfig,
					runtimeOptions: {
						summaryOptions: {
							summaryConfigOverrides: {
								...DefaultSummaryConfiguration,
								...{
									minIdleTime: IdleDetectionTime,
									maxIdleTime: IdleDetectionTime,
									maxTime: IdleDetectionTime * 12,
									initialSummarizerDelayMs: 10,
								},
							},
						},
						gcOptions: {
							gcAllowed: true,
						},
					},
				});

				// andre4i: Move this into test utils or something. Same as for other
				// flavors of this function across the end to end tests
				const waitForSummary = async (
					testObjectProvider: ITestObjectProvider,
					container: IContainer,
					summaryCollection: SummaryCollection,
				): Promise<string> => {
					await testObjectProvider.ensureSynchronized();
					const ackedSummary: IAckedSummary = await summaryCollection.waitSummaryAck(
						container.deltaManager.lastSequenceNumber,
					);
					return ackedSummary.summaryAck.contents.handle;
				};

				const sc = new SummaryCollection(container1.deltaManager, createChildLogger());
				const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
				const ds2 = await runtimeOf(dataObject2).createDataStore(packageName);

				const aliasResult1 = await ds1.trySetAlias(alias);
				const aliasResult2 = await ds2.trySetAlias(alias);
				assert.equal(aliasResult1, "Success");
				assert.equal(aliasResult2, "Conflict");

				await provider.ensureSynchronized();
				const version = await waitForSummary(provider, container1, sc);

				const container3 = await provider.loadTestContainer(
					testContainerConfig,
					{
						[LoaderHeader.version]: version,
					}, // requestHeader
				);
				const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "/");
				const ds3 = await runtimeOf(dataObject3).createDataStore(packageName);
				const aliasResult3 = await ds3.trySetAlias(alias);

				assert.equal(aliasResult3, "Conflict");
				assert.ok(await getAliasedDataStoreEntryPoint(dataObject3, alias));
			},
		);

		/**
		 * Aliasing datastores summarized before the alias op is sent and after the attach op is sent
		 * does not cause a datastore corruption issue
		 *
		 * This test validates a bug where the rootiness of a datastore was not set to true in the
		 * above scenario.
		 */
		it("Aliasing a bound datastore marks it as root correctly", async () => {
			const aliasableDataStore1 = await runtimeOf(dataObject1).createDataStore(packageName);
			const aliasedDataStoreResponse1 = await aliasableDataStore1.request({ url: "/" });
			const aliasedDataStore1 = aliasedDataStoreResponse1.value as ITestFluidObject;
			// Casting any to repro a race condition where bindToContext is called before summarization,
			// but aliasing happens afterwards
			(
				aliasableDataStore1 as IDataStoreWithBindToContext_Deprecated
			).fluidDataStoreChannel?.bindToContext?.();
			await provider.ensureSynchronized();

			let dataStore: FluidObject | undefined;
			let error: unknown;
			try {
				dataStore = await getAliasedDataStoreEntryPoint(
					dataObject2,
					aliasedDataStore1.runtime.id,
				);
			} catch (e) {
				// back-compat - getRootDataStore throws an error if the data store doesn't exist.
				error = e;
			}
			assert(
				dataStore === undefined || error !== undefined,
				"Expected getAliasedDataStoreEntryPoint to fail as the datastore is not yet a root datastore",
			);

			// Alias a datastore
			const _alias = "alias";
			const aliasResult1 = await aliasableDataStore1.trySetAlias(_alias);
			assert(
				aliasResult1 === "Success",
				`Expected an successful aliasing. Got: ${aliasResult1}`,
			);
			await provider.ensureSynchronized();

			// Should be able to retrieve root datastore from remote
			assert.doesNotThrow(
				async () => getAliasedDataStoreEntryPoint(dataObject2, _alias),
				"A remote aliased datastore should be a root datastore",
			);

			// Should be able to retrieve local root datastore
			assert.doesNotThrow(
				async () => getAliasedDataStoreEntryPoint(dataObject1, _alias),
				"A local aliased datastore should be a root datastore",
			);
		});
	});
});
