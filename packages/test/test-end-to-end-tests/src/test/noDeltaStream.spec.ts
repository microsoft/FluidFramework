/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { describeCompat } from "@fluid-private/test-version-utils";
import {
	IContainerLoadMode,
	LoaderHeader,
} from "@fluidframework/container-definitions/internal";
import {
	loadContainerPaused,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import {
	DefaultSummaryConfiguration,
	SummaryCollection,
} from "@fluidframework/container-runtime/internal";
import {
	IDocumentService,
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import {
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	createLoader,
	createLoaderProps,
	getContainerEntryPointBackCompat,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";

import { wrapObjectAndOverride } from "../mocking.js";

const loadOptions: IContainerLoadMode[] = generatePairwiseOptions<IContainerLoadMode>({
	deltaConnection: [undefined, "none", "delayed"],
	opsBeforeReturn: [undefined, "cached", "all"],
});

const testConfigs = generatePairwiseOptions({
	loadOptions,
	waitForSummary: [true, false],
	opsUpToSeqNumber: [true, false, undefined],
});

const maxOps = 10;
const testContainerConfig: ITestContainerConfig = {
	runtimeOptions: {
		// strictly control summarization
		summaryOptions: {
			summaryConfigOverrides: {
				...DefaultSummaryConfiguration,
				...{
					// Wasn't getting summaryAck before timeout (since we weight on number of ops, and the number of ops is lower in RunningSummarizer.ctor)
					minIdleTime: 500,
					maxIdleTime: 500,
					maxTime: 1000 * 5,
					initialSummarizerDelayMs: 0,
					maxOps,
					nonRuntimeOpWeight: 1.0,
					runtimeOpWeight: 1.0,
				},
			},
			initialSummarizerDelayMs: 0,
		},
	},
};

const testContainerConfigDisabled: ITestContainerConfig = {
	runtimeOptions: {
		// strictly control summarization
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	},
};

describeCompat(
	"No Delta stream loading mode testing",
	"FullCompat",
	(getTestObjectProvider) => {
		const scenarioToContainerUrl = new Map<string, string>();
		const scenarioToSeqNum = new Map<string, number>();

		before(() => {
			// clear first, so each version combination gets a new container
			scenarioToContainerUrl.clear();
			scenarioToSeqNum.clear();
		});
		async function setupContainer(
			provider: ITestObjectProvider,
			waitForSummary: boolean,
			timeout: number,
		) {
			const scenario = JSON.stringify(waitForSummary ?? "undefined");
			if (!scenarioToContainerUrl.has(scenario)) {
				let containerResolvedUrl: IResolvedUrl | undefined;
				// initialize the container and its data
				{
					const initLoader = createLoader(
						[
							[
								provider.defaultCodeDetails,
								provider.createFluidEntryPoint(testContainerConfigDisabled),
							],
						],
						provider.documentServiceFactory,
						provider.urlResolver,
					);

					const initContainer = await initLoader.createDetachedContainer(
						provider.defaultCodeDetails,
					);
					await initContainer.attach(
						provider.driver.createCreateNewRequest(provider.documentId),
					);
					containerResolvedUrl = initContainer.resolvedUrl;

					const initDataObject =
						await getContainerEntryPointBackCompat<ITestFluidObject>(initContainer);
					for (let i = 0; i < maxOps; i++) {
						initDataObject.root.set(i.toString(), i);
					}
					if (initContainer.isDirty) {
						await timeoutPromise((res) => initContainer.once("saved", () => res()), {
							durationMs: timeout / 2,
							errorMsg: "Not saved before timeout",
						});
					}
					scenarioToSeqNum.set(scenario, initContainer.deltaManager.lastSequenceNumber);
					initContainer.close();
				}
				const containerUrl = await provider.driver.createContainerUrl(
					provider.documentId,
					containerResolvedUrl,
				);
				scenarioToContainerUrl.set(scenario, containerUrl);

				// if we want there to be a summary before we load the storage only container
				// wait for it here
				if (waitForSummary) {
					const summaryLoader = createLoader(
						[
							[
								provider.defaultCodeDetails,
								provider.createFluidEntryPoint({
									...testContainerConfig,
									runtimeOptions: {
										...testContainerConfig.runtimeOptions,
										summaryOptions: {
											...testContainerConfig.runtimeOptions?.summaryOptions,
										},
									},
								}),
							],
						],
						provider.documentServiceFactory,
						provider.urlResolver,
					);
					const summaryContainer = await summaryLoader.resolve({
						url: containerUrl,
					});

					// Force the container into write mode to ensure a summary will be created
					const dataObject =
						await getContainerEntryPointBackCompat<ITestFluidObject>(summaryContainer);
					dataObject.root.set("Force write", 0);

					const summaryCollection = new SummaryCollection(
						summaryContainer.deltaManager,
						createChildLogger(),
					);

					await timeoutPromise((res) => summaryCollection.once("summaryAck", () => res()), {
						durationMs: timeout / 2,
						errorMsg: "Not summary acked before timeout",
					});
					scenarioToSeqNum.set(scenario, summaryContainer.deltaManager.lastSequenceNumber);
					summaryContainer.close();
				}
			}
			return {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				containerUrl: scenarioToContainerUrl.get(scenario)!,
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				lastKnownSeqNum: scenarioToSeqNum.get(scenario)!,
			};
		}

		for (const testConfig of testConfigs) {
			it(`Validate Load Modes: ${JSON.stringify(
				testConfig ?? "undefined",
			)}`, async function () {
				const provider = getTestObjectProvider();
				// REVIEW: enable CrossVersion compat testing?
				if (provider.type === "TestObjectProviderWithVersionedLoad") {
					this.skip();
				}
				switch (provider.driver.type) {
					case "local":
						break;
					default:
						this.skip();
				}
				const { containerUrl, lastKnownSeqNum } = await setupContainer(
					provider,
					testConfig.waitForSummary,
					this.timeout(),
				);

				// spin up a validation (normal) and a storage only client, and check that they see the same things
				{
					const validationLoaderProps = createLoaderProps(
						[
							[
								provider.defaultCodeDetails,
								provider.createFluidEntryPoint(testContainerConfigDisabled),
							],
						],
						provider.documentServiceFactory,
						provider.urlResolver,
					);
					const validationContainer = await loadExistingContainer({
						...validationLoaderProps,
						request: { url: containerUrl },
					});
					const validationDataObject =
						await getContainerEntryPointBackCompat<ITestFluidObject>(validationContainer);

					const storageOnlyDsF = wrapObjectAndOverride<IDocumentServiceFactory>(
						provider.documentServiceFactory,
						{
							createDocumentService: {
								policies: (ds) => {
									const policies: IDocumentService["policies"] = {
										...ds.policies,
										storageOnly: true,
									};
									return policies;
								},
							},
						},
					);

					const storageOnlyLoaderProps = createLoaderProps(
						[
							[
								provider.defaultCodeDetails,
								provider.createFluidEntryPoint(testContainerConfigDisabled),
							],
						],
						storageOnlyDsF,
						provider.urlResolver,
					);

					if (testConfig.opsUpToSeqNumber !== undefined) {
						// Define sequenceNumber if opsUpToSeqNumber is set, otherwise leave undefined
						const sequenceNumber = testConfig.opsUpToSeqNumber ? lastKnownSeqNum : undefined;
						const storageOnlyContainer = await loadContainerPaused(
							storageOnlyLoaderProps,
							{
								url: containerUrl,
								headers: {
									[LoaderHeader.loadMode]: testConfig.loadOptions,
								},
							},
							sequenceNumber,
						);

						const deltaManager = storageOnlyContainer.deltaManager;
						const loadedSeqNum = deltaManager.lastSequenceNumber;

						if (testConfig.opsUpToSeqNumber === true) {
							// If we tried to freeze after loading a specific sequence number, the loaded sequence number should be the same as the last known sequence number.
							assert.strictEqual(
								loadedSeqNum,
								lastKnownSeqNum,
								"loadedSeqNum === lastKnownSeqNum",
							);
						}
						// The sequence number should still be the same as when we loaded.
						assert.strictEqual(
							deltaManager.lastSequenceNumber,
							loadedSeqNum,
							"deltaManager.lastSequenceNumber === loadedSeqNum",
						);
					} else {
						const storageOnlyContainer = await loadExistingContainer({
							...storageOnlyLoaderProps,
							request: {
								url: containerUrl,
								headers: {
									[LoaderHeader.loadMode]: testConfig.loadOptions,
								},
							},
						});

						const deltaManager = storageOnlyContainer.deltaManager;

						storageOnlyContainer.connect();
						assert.strictEqual(deltaManager.active, false, "deltaManager.active");
						assert.ok(
							deltaManager.readOnlyInfo.readonly,
							"deltaManager.readOnlyInfo.readonly",
						);
						assert.ok(
							deltaManager.readOnlyInfo.permissions,
							"deltaManager.readOnlyInfo.permissions",
						);
						assert.ok(
							deltaManager.readOnlyInfo.storageOnly,
							"deltaManager.readOnlyInfo.storageOnly",
						);

						const storageOnlyDataObject =
							await getContainerEntryPointBackCompat<ITestFluidObject>(storageOnlyContainer);
						for (const key of validationDataObject.root.keys()) {
							assert.strictEqual(
								storageOnlyDataObject.root.get(key),
								storageOnlyDataObject.root.get(key),
								`${storageOnlyDataObject.root.get(key)} !== ${storageOnlyDataObject.root.get(
									key,
								)}`,
							);
						}
					}
				}
			});
		}
	},
);
