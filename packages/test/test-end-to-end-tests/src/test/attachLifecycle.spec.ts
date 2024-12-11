/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { describeCompat } from "@fluid-private/test-version-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { DisconnectReason } from "@fluidframework/container-definitions/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import type { ISharedMap, IValueChanged } from "@fluidframework/map/internal";
import type { SequenceDeltaEvent, SharedString } from "@fluidframework/sequence/internal";
import {
	ITestFluidObject,
	getContainerEntryPointBackCompat,
	getDataStoreEntryPointBackCompat,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";

// during these point succeeding objects won't even exist locally
const ContainerCreated = 0;
const DatastoreCreated = 1;
const DdsCreated = 2;

// these points are after all objects at least exist locally
const sharedPoints = [3, 4, 5];

const ddsKey = "string";

const testConfigs = generatePairwiseOptions({
	containerAttachPoint: [ContainerCreated, DatastoreCreated, DdsCreated, ...sharedPoints],
	containerSaveAfterAttach: [true, false],
	datastoreAttachPoint: [DatastoreCreated, DdsCreated, ...sharedPoints],
	datastoreSaveAfterAttach: [true, false],
	ddsAttachPoint: [DdsCreated, ...sharedPoints],
	ddsSaveAfterAttach: [true, false],
});

describeCompat("Validate Attach lifecycle", "FullCompat", (getTestObjectProvider, apis) => {
	const { SharedString } = apis.dds;
	before(function () {
		const provider = getTestObjectProvider();
		switch (provider.driver.type) {
			case "local":
			case "tinylicious":
				break;
			default:
				this.skip();
		}
	});
	for (const testConfig of testConfigs) {
		it(`Validate attach orders: ${JSON.stringify(
			testConfig ?? "undefined",
		)}`, async function () {
			// setup shared states
			const provider = getTestObjectProvider();
			const timeoutDurationMs = this.timeout() / 2;
			let containerUrl: IResolvedUrl | undefined;
			const sharedStringFactory = SharedString.getFactory();
			const channelFactoryRegistry: [string | undefined, IChannelFactory][] = [
				[sharedStringFactory.type, sharedStringFactory],
			];
			const containerConfig = { registry: channelFactoryRegistry };

			// act code block
			{
				const initLoader = provider.makeTestLoader(containerConfig);

				const initContainer = await initLoader.createDetachedContainer(
					provider.defaultCodeDetails,
				);
				const attachContainer = async () => {
					const attachP = initContainer.attach(
						provider.driver.createCreateNewRequest(provider.documentId),
					);
					if (testConfig.containerSaveAfterAttach) {
						await attachP;
					}
				};
				if (testConfig.containerAttachPoint === ContainerCreated) {
					// point 0 - at container create, datastore and dss don't exist
					await attachContainer();
				}

				const initDataObject =
					await getContainerEntryPointBackCompat<ITestFluidObject>(initContainer);

				const ds = await initDataObject.context.containerRuntime.createDataStore("default");
				const newDataObj = await getDataStoreEntryPointBackCompat<ITestFluidObject>(ds);
				const attachDatastore = async () => {
					initDataObject.root.set("ds", newDataObj.handle);
					while (
						testConfig.datastoreSaveAfterAttach &&
						initContainer.isDirty &&
						initContainer.attachState !== AttachState.Detached
					) {
						await timeoutPromise((resolve) => initContainer.once("saved", () => resolve()), {
							durationMs: timeoutDurationMs,
							errorMsg: "datastoreSaveAfterAttach timeout",
						});
					}
				};
				if (testConfig.datastoreAttachPoint === DatastoreCreated) {
					// point 1 - at datastore create, dds does not exist
					await attachDatastore();
				}
				if (testConfig.containerAttachPoint === DatastoreCreated) {
					// point 1 - datastore exists as least locally, but dds does not.
					await attachContainer();
				}

				const newString = SharedString.create(newDataObj.runtime);
				const attachDds = async () => {
					newDataObj.root.set(ddsKey, newString.handle);
					while (
						testConfig.ddsSaveAfterAttach &&
						initContainer.isDirty &&
						initContainer.attachState !== AttachState.Detached
					) {
						await timeoutPromise((resolve) => initContainer.once("saved", () => resolve()), {
							durationMs: timeoutDurationMs,
							errorMsg: "ddsSaveAfterAttach timeout",
						});
					}
				};
				if (testConfig.ddsAttachPoint === DdsCreated) {
					await attachDds();
				}
				if (testConfig.datastoreAttachPoint === DdsCreated) {
					await attachDatastore();
				}
				if (testConfig.containerAttachPoint === DdsCreated) {
					await attachContainer();
				}

				// all objects, container, datastore, and dds are created, at least in memory at this point
				// so now we can attach whatever is not in the presence of all the others
				for (const i of sharedPoints) {
					// also send an op at these points
					// we'll use these to validate
					newString.insertText(convertSharedPointToPos(i), i.toString());

					if (testConfig.containerAttachPoint === i) {
						await attachContainer();
					}
					if (testConfig.datastoreAttachPoint === i) {
						await attachDatastore();
					}
					if (testConfig.ddsAttachPoint === i) {
						await attachDds();
					}
				}

				while (initContainer.attachState !== AttachState.Attached) {
					await timeoutPromise((resolve) => initContainer.once("attached", () => resolve()), {
						durationMs: timeoutDurationMs,
						errorMsg: "container attach timeout",
					});
				}

				while (initContainer.isDirty) {
					await timeoutPromise((resolve) => initContainer.once("saved", () => resolve()), {
						durationMs: timeoutDurationMs,
						errorMsg: "final save timeout",
					});
				}
				containerUrl = initContainer.resolvedUrl;

				initContainer.close(DisconnectReason.Expected);
			}

			// validation code block
			{
				const validationLoader = provider.makeTestLoader(containerConfig);
				const validationContainer = await validationLoader.resolve({
					url: await provider.driver.createContainerUrl(provider.documentId, containerUrl),
				});

				const initDataObject =
					await getContainerEntryPointBackCompat<ITestFluidObject>(validationContainer);

				const newDatastore = await (
					await waitKey<IFluidHandle<ITestFluidObject>>(
						initDataObject.root,
						"ds",
						timeoutDurationMs,
					)
				).get();

				const newString = await (
					await waitKey<IFluidHandle<SharedString>>(
						newDatastore.root,
						ddsKey,
						timeoutDurationMs,
					)
				).get();

				for (const i of sharedPoints) {
					assert.equal(
						await waitChar(newString, convertSharedPointToPos(i), timeoutDurationMs),
						i.toString(),
						`No match at {i}`,
					);
				}
			}
		});
	}
});

function convertSharedPointToPos(i: number) {
	return i - sharedPoints[0];
}

async function waitChar(
	sharedString: SharedString,
	pos: number,
	timeoutDurationMs: number,
): Promise<string> {
	return timeoutPromise<string>(
		(resolve) => {
			const text = sharedString.getText();
			if (text.length > pos) {
				resolve(text[pos]);
			} else {
				const waitFunc = (event: SequenceDeltaEvent) => {
					const range = event.ranges.find((value) => value.position === pos);
					if (range) {
						sharedString.off("sequenceDelta", waitFunc);
						resolve(sharedString.getText()[pos]);
					}
				};
				sharedString.on("sequenceDelta", waitFunc);
			}
		},
		{ durationMs: timeoutDurationMs, errorMsg: `${pos} not available before timeout` },
	);
}

async function waitKey<T>(
	map: ISharedMap,
	key: string,
	timeoutDurationMs: number,
): Promise<T> {
	return timeoutPromise<T>(
		(resolve) => {
			if (map.has(key)) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				resolve(map.get<T>(key)!);
			} else {
				const waitFunc = (changed: IValueChanged) => {
					if (changed.key === key) {
						map.off("valueChanged", waitFunc);
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						resolve(map.get<T>(key)!);
					}
				};
				map.on("valueChanged", waitFunc);
			}
		},
		{ durationMs: timeoutDurationMs, errorMsg: `${key} not available before timeout` },
	);
}
