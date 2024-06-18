/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import {
	DefaultSummaryConfiguration,
	IAckedSummary,
	SummaryCollection,
} from "@fluidframework/container-runtime/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { IDataStore } from "@fluidframework/runtime-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";

describeCompat("Named root data stores", "FullCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
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
		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);

		container2 = await provider.loadTestContainer(configWithFeatureGates);
		dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);

		await provider.ensureSynchronized();
	};

	const reset = async () => provider.reset();

	const runtimeOf = (dataObject: ITestFluidObject): IContainerRuntime =>
		dataObject.context.containerRuntime as IContainerRuntime;

	const createDataStoreWithProps = async (dataObject: ITestFluidObject, id: string) =>
		runtimeOf(dataObject)._createDataStoreWithProps(packageName, {}, id);

	/**
	 * Gets an aliased data store with the given id. Throws an error if the data store cannot be retrieved.
	 */
	async function getAliasedDataStoreEntryPoint(dataObject: ITestFluidObject, id: string) {
		// Back compat support - older versions of the runtime do not have getAliasedDataStoreEntryPoint
		// Can be removed once we no longer support ^2.0.0-internal.7.0.0
		const dataStore = await (runtimeOf(dataObject).getAliasedDataStoreEntryPoint?.(id) ??
			(runtimeOf(dataObject) as any).getRootDataStore(id, false /* wait */));
		if (dataStore === undefined) {
			throw new Error("Could not get aliased data store");
		}
		return dataStore;
	}

	describe("Legacy APIs", () => {
		beforeEach("setupContainers", async () => setupContainers(testContainerConfig));
		afterEach(async () => reset());

		it("Datastore creation with legacy API returns datastore which can be aliased", async () => {
			const ds = await createDataStoreWithProps(dataObject1, "1");
			const aliasResult = await ds.trySetAlias("2");
			assert.equal(aliasResult, "Success");
		});
	});

	describe("Aliasing", () => {
		beforeEach("setupContainers", async () => setupContainers());
		afterEach(async () => reset());

		const alias = "alias";

		it("Assign multiple data stores to the same alias, first write wins, same container - detached", async function () {
			const loader = provider.makeTestLoader(testContainerConfig) as Loader;
			const container: IContainer = await loader.createDetachedContainer(
				provider.defaultCodeDetails,
			);
			const request = provider.driver.createCreateNewRequest(provider.documentId);
			const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
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

		it("Assign multiple data stores to the same alias, first write wins, same container", async function () {
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
			await assert.rejects(
				getAliasedDataStoreEntryPoint(dataObject1, wrongAlias),
				"Aliasing should not have happened",
			);
		});

		it("Aliasing a datastore is idempotent", async function () {
			const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);

			const aliasResult1 = await ds1.trySetAlias(alias);
			const aliasResult2 = await ds1.trySetAlias(alias);

			assert.equal(aliasResult1, "Success");
			assert.equal(aliasResult2, "Success");

			assert.ok(await getAliasedDataStoreEntryPoint(dataObject1, alias));
		});

		it("Aliasing a datastore while aliasing", async function () {
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
			async function () {
				const datastores: IDataStore[] = [];
				const createAliasedDataStore = async () => {
					try {
						await getAliasedDataStoreEntryPoint(dataObject1, alias);
					} catch (err) {
						const newDataStore = await runtimeOf(dataObject1).createDataStore(packageName);
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

		it("Aliasing a datastore during an alias operation with the same name", async function () {
			// TODO: Re-enable after cross version compat bugs are fixed - ADO:6978
			if (provider.type === "TestObjectProviderWithVersionedLoad") {
				this.skip();
			}
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

		it("Aliasing a previously aliased datastore will fail", async function () {
			const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);

			const aliasResult1 = await ds1.trySetAlias(alias);
			const aliasResult2 = await ds1.trySetAlias(alias + alias);

			assert.equal(aliasResult1, "Success");
			assert.equal(aliasResult2, "AlreadyAliased");

			assert.ok(await getAliasedDataStoreEntryPoint(dataObject1, alias));
		});

		it("Aliasing a datastore which previously failed to alias will succeed", async function () {
			// TODO: Re-enable after cross version compat bugs are fixed - ADO:6978
			if (provider.type === "TestObjectProviderWithVersionedLoad") {
				this.skip();
			}
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

		it("Assign multiple data stores to the same alias, first write wins, different containers", async function () {
			const ds1 = await runtimeOf(dataObject1).createDataStore(packageName);
			const ds2 = await runtimeOf(dataObject2).createDataStore(packageName);

			const aliasResult1 = await ds1.trySetAlias(alias);
			const aliasResult2 = await ds2.trySetAlias(alias);

			assert.equal(aliasResult1, "Success");
			assert.equal(aliasResult2, "Conflict");

			await provider.ensureSynchronized();
			const container3 = await provider.loadTestContainer(testContainerConfig);
			const dataObject3 = await getContainerEntryPointBackCompat<ITestFluidObject>(container3);

			await provider.ensureSynchronized();
			assert.ok(await getAliasedDataStoreEntryPoint(dataObject3, alias));
		});

		it(
			"Assign multiple data stores to the same alias, first write wins, " +
				"different containers from snapshot",
			async function () {
				// TODO: Re-enable after cross version compat bugs are fixed - ADO:6978
				if (provider.type === "TestObjectProviderWithVersionedLoad") {
					this.skip();
				}

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
				const dataObject3 =
					await getContainerEntryPointBackCompat<ITestFluidObject>(container3);
				const ds3 = await runtimeOf(dataObject3).createDataStore(packageName);
				const aliasResult3 = await ds3.trySetAlias(alias);

				assert.equal(aliasResult3, "Conflict");
				assert.ok(await getAliasedDataStoreEntryPoint(dataObject3, alias));
			},
		);

		it("getAliasedDataStoreEntryPoint only returns aliased data stores", async function () {
			// TODO: Re-enable after cross version compat bugs are fixed - ADO:6978
			if (provider.type === "TestObjectProviderWithVersionedLoad") {
				this.skip();
			}
			const dataStore = await runtimeOf(dataObject1).createDataStore(packageName);
			const dataObject = (await dataStore.entryPoint?.get()) as ITestFluidObject;
			assert(dataObject !== undefined, "could not create data store");

			await assert.rejects(
				getAliasedDataStoreEntryPoint(dataObject1, dataObject.runtime.id),
				"Expected getAliasedDataStoreEntryPoint to fail as the datastore is not yet a root datastore",
			);

			// Alias the datastore
			const aliasResult1 = await dataStore.trySetAlias(alias);
			assert(
				aliasResult1 === "Success",
				`Expected an successful aliasing. Got: ${aliasResult1}`,
			);
			await provider.ensureSynchronized();

			// Should be able to retrieve root datastore from remote
			await assert.doesNotReject(
				getAliasedDataStoreEntryPoint(dataObject2, alias),
				"A remote aliased datastore should be a root datastore",
			);

			// Should be able to retrieve local root datastore
			await assert.doesNotReject(
				getAliasedDataStoreEntryPoint(dataObject1, alias),
				"A local aliased datastore should be a root datastore",
			);
		});
	});
});
