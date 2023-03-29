/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import {
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	ChannelFactoryRegistry,
	ITestFluidObject,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { IValueChanged, SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedCell } from "@fluidframework/cell";

const stringId = "sharedStringKey";
const dirId = "sharedDirKey";
const cellId = "cellKey";
const mapId = "mapKey";
const registry: ChannelFactoryRegistry = [
	[stringId, SharedString.getFactory()],
	[dirId, SharedDirectory.getFactory()],
	[cellId, SharedCell.getFactory()],
	[mapId, SharedMap.getFactory()],
];
const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
};

describeNoCompat("Multiple DDS orderSequentially", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	let container: IContainer;
	let dataObject: ITestFluidObject;
	let sharedString: SharedString;
	let sharedDir: SharedDirectory;
	let sharedCell: SharedCell;
	let sharedMap: SharedMap;
	let changedEventData: IValueChanged[];
	let containerRuntime: ContainerRuntime;
	let error: Error | undefined;

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});
	const errorMessage = "callback failure";

	beforeEach(async () => {
		const configWithFeatureGates = {
			...testContainerConfig,
			loaderProps: {
				configProvider: configProvider({
					"Fluid.ContainerRuntime.EnableRollback": true,
				}),
			},
		};
		container = await provider.makeTestContainer(configWithFeatureGates);
		dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
		sharedString = await dataObject.getSharedObject<SharedString>(stringId);
		sharedDir = await dataObject.getSharedObject<SharedDirectory>(dirId);
		sharedCell = await dataObject.getSharedObject<SharedCell>(cellId);
		sharedMap = await dataObject.getSharedObject<SharedMap>(mapId);

		containerRuntime = dataObject.context.containerRuntime as ContainerRuntime;
		changedEventData = [];
		sharedDir.on("valueChanged", (changed, _local, _target) => {
			changedEventData.push(changed);
		});
		sharedCell.on("valueChanged", (value) => {
			changedEventData.push(value);
		});
		sharedCell.on("delete", (value) => {
			changedEventData.push(value);
		});
		sharedMap.on("valueChanged", (value) => {
			changedEventData.push(value);
		});
	});

	it("Should rollback simple edits on multiple DDS types", () => {
		sharedString.insertText(0, "abcde");
		sharedMap.set("key1", 0);
		sharedDir.set("key2", 1);
		sharedCell.set(2);
		try {
			containerRuntime.orderSequentially(() => {
				sharedString.removeRange(0, 5);
				sharedMap.delete("key1");
				sharedDir.delete("key2");
				sharedCell.delete();
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false, "Container disposed");
		assert.equal(sharedString.getText(), "abcde");
		assert.equal(sharedMap.size, 1);
		assert.equal(sharedMap.has("key1"), true);
		assert.equal(sharedMap.get("key1"), 0);
		assert.equal(sharedDir.size, 1);
		assert.equal(sharedDir.has("key2"), true);
		assert.equal(sharedDir.get("key2"), 1);
		assert.equal(sharedCell.get(), 2);

		assert.equal(changedEventData.length, 9);
		assert.equal(changedEventData[0].key, "key1");
		assert.equal(changedEventData[0].previousValue, undefined);

		assert.equal(changedEventData[1].key, "key2");
		assert.equal(changedEventData[1].previousValue, undefined);

		assert.equal(changedEventData[2], 2);

		// rollback
		assert.equal(changedEventData[3].key, "key1");
		assert.equal(changedEventData[3].previousValue, 0);

		assert.equal(changedEventData[4].key, "key2");
		assert.equal(changedEventData[4].previousValue, 1);

		assert.equal(changedEventData[5], undefined);

		assert.equal(changedEventData[6], 2);

		assert.equal(changedEventData[7].key, "key2");
		assert.equal(changedEventData[7].previousValue, undefined);

		assert.equal(changedEventData[8].key, "key1");
		assert.equal(changedEventData[8].previousValue, undefined);
	});

	it("Should rollback complex edits on multiple DDS types", () => {
		sharedString.insertText(0, "abcde");
		sharedMap.set("key1", 0);
		sharedString.annotateRange(2, 5, { foo: "old" });
		sharedDir.set("key2", 1);
		sharedCell.set(2);
		try {
			containerRuntime.orderSequentially(() => {
				sharedMap.set("key1", 3);
				sharedString.annotateRange(0, 3, { foo: "new" });
				sharedDir.delete("key2");
				sharedCell.set(5);
				sharedString.removeRange(0, 5);
				sharedCell.delete();
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false, "Container disposed");
		assert.equal(sharedString.getText(), "abcde");
		for (let i = 0; i < sharedString.getText().length; i++) {
			const props = sharedString.getPropertiesAtPosition(i);
			if (i >= 2 && i < 5) {
				assert.equal(props?.foo, "old");
			} else {
				assert(props === undefined || props.foo === undefined);
			}
		}
		assert.equal(sharedMap.size, 1);
		assert.equal(sharedMap.has("key1"), true);
		assert.equal(sharedMap.get("key1"), 0);
		assert.equal(sharedDir.size, 1);
		assert.equal(sharedDir.has("key2"), true);
		assert.equal(sharedDir.get("key2"), 1);
		assert.equal(sharedCell.get(), 2);

		assert.equal(changedEventData.length, 11);
		assert.equal(changedEventData[0].key, "key1");
		assert.equal(changedEventData[0].previousValue, undefined);

		assert.equal(changedEventData[1].key, "key2");
		assert.equal(changedEventData[1].previousValue, undefined);

		assert.equal(changedEventData[2], 2);

		// rollback
		assert.equal(changedEventData[3].key, "key1");
		assert.equal(changedEventData[3].previousValue, 0);

		assert.equal(changedEventData[4].key, "key2");
		assert.equal(changedEventData[4].previousValue, 1);

		assert.equal(changedEventData[5], 5);

		assert.equal(changedEventData[6], undefined);

		assert.equal(changedEventData[7], 5);

		assert.equal(changedEventData[8], 2);

		assert.equal(changedEventData[9].key, "key2");
		assert.equal(changedEventData[9].previousValue, undefined);

		assert.equal(changedEventData[10].key, "key1");
		assert.equal(changedEventData[10].previousValue, 3);
	});
});
