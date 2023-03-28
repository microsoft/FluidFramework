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
const string2Id = "sharedString2Key";
const dir2Id = "sharedDir2Key";
const cell2Id = "cell2Key";
const map2Id = "map2Key";
const registry: ChannelFactoryRegistry = [
	[stringId, SharedString.getFactory()],
	[dirId, SharedDirectory.getFactory()],
	[cellId, SharedCell.getFactory()],
	[mapId, SharedMap.getFactory()],
	[string2Id, SharedString.getFactory()],
	[dir2Id, SharedDirectory.getFactory()],
	[cell2Id, SharedCell.getFactory()],
	[map2Id, SharedMap.getFactory()],
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
	let string2: SharedString;
	let dir2: SharedDirectory;
	let cell2: SharedCell;
	let map2: SharedMap;
	let changedEventData: IValueChanged[];
	let changedData2: IValueChanged[];
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
		string2 = await dataObject.getSharedObject<SharedString>(string2Id);
		dir2 = await dataObject.getSharedObject<SharedDirectory>(dir2Id);
		cell2 = await dataObject.getSharedObject<SharedCell>(cell2Id);
		map2 = await dataObject.getSharedObject<SharedMap>(map2Id);

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
		changedData2 = [];
		dir2.on("valueChanged", (changed, _local, _target) => {
			changedData2.push(changed);
		});
		cell2.on("valueChanged", (value) => {
			changedData2.push(value);
		});
		cell2.on("delete", (value) => {
			changedData2.push(value);
		});
		map2.on("valueChanged", (value) => {
			changedData2.push(value);
		});
	});

	it("Should rollback simple edits on multiple strings in order", () => {
		sharedString.insertText(0, "abcd");
		string2.insertText(0, "12345");
		sharedString.insertText(2, "123");
		string2.insertText(2, "abc");
		try {
			containerRuntime.orderSequentially(() => {
				sharedString.removeRange(1, 3);
				string2.removeRange(4, 6);
				throw new Error("callback failure");
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false);
		assert.equal(sharedString.getText(), "ab123cd");
		assert.equal(string2.getText(), "12abc345");
	});

	it("Should rollback complex edits on multiple strings in the correct order", () => {
		sharedString.insertText(0, "abcd");
		string2.insertText(0, "12345");
		sharedString.removeRange(2, 4);
		string2.removeRange(2, 3);
		string2.insertText(2, "abc");
		sharedString.insertText(2, "123");
		string2.annotateRange(1, 5, { foo: "bar" });
		sharedString.annotateRange(1, 4, { foo: "bar" });
		try {
			containerRuntime.orderSequentially(() => {
				sharedString.removeRange(1, 3);
				string2.removeRange(4, 6);
				throw new Error("callback failure");
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false);
		assert.equal(sharedString.getText(), "ab123");
		assert.equal(string2.getText(), "12abc45");
		for (let i = 0; i < sharedString.getText().length; i++) {
			const props = sharedString.getPropertiesAtPosition(i);
			if (i >= 1 && i < 4) {
				assert.equal(props?.foo, "bar");
			} else {
				assert(props === undefined || props.foo === undefined);
			}
		}
		for (let i = 0; i < string2.getText().length; i++) {
			const props = string2.getPropertiesAtPosition(i);
			if (i >= 1 && i < 5) {
				assert.equal(props?.foo, "bar");
			} else {
				assert(props === undefined || props.foo === undefined);
			}
		}
	});

	it("Should rollback string and directory edits in the correct order", () => {
		sharedString.insertText(0, "abcd");
		sharedDir.set("key", 1);
		try {
			containerRuntime.orderSequentially(() => {
				sharedDir.set("key", 0);
				sharedString.insertText(2, "123");
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}
		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false, "Container disposed");
		assert.equal(sharedString.getText(), "abcd");
		assert.equal(sharedDir.size, 1);
		assert.equal(sharedDir.has("key"), true);
		assert.equal(sharedDir.get("key"), 1);
		assert.equal(changedEventData.length, 3);
		assert.equal(changedEventData[0].key, "key");
		assert.equal(changedEventData[0].previousValue, undefined);
		assert.equal(changedEventData[1].key, "key");
		assert.equal(changedEventData[1].previousValue, 1);
		// rollback
		assert.equal(changedEventData[2].key, "key");
		assert.equal(changedEventData[2].previousValue, 0);
	});

	it("Should rollback string and cell edits in the correct order", () => {
		sharedString.insertText(0, "abcd");
		sharedCell.set("old");
		try {
			containerRuntime.orderSequentially(() => {
				sharedString.removeRange(1, 2);
				sharedCell.set("new");
				sharedString.insertText(0, "123");
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false);
		assert.equal(sharedString.getText(), "abcd");
		assert.equal(sharedCell.get(), "old");
		assert.equal(changedEventData.length, 3);
		assert.equal(changedEventData[0], "old");
		// rollback
		assert.equal(changedEventData[1], "new");
		assert.equal(changedEventData[2], "old");
	});

	it("Should rollback string and map edits in the correct order", () => {
		sharedString.insertText(0, "abcd");
		sharedMap.set("key", 1);
		try {
			containerRuntime.orderSequentially(() => {
				sharedMap.set("key", 0);
				sharedString.insertText(2, "123");
				sharedMap.delete("key");
				sharedString.removeRange(0, 2);
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}
		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false, "Container disposed");
		assert.equal(sharedString.getText(), "abcd");
		assert.equal(sharedMap.has("key"), true);
		assert.equal(sharedMap.size, 1);
		assert.equal(sharedMap.get("key"), 1);
		assert.equal(changedEventData.length, 5);
		assert.equal(changedEventData[0].key, "key");
		assert.equal(changedEventData[0].previousValue, undefined);
		assert.equal(changedEventData[1].key, "key");
		assert.equal(changedEventData[1].previousValue, 1);
		// rollback
		assert.equal(changedEventData[2].key, "key");
		assert.equal(changedEventData[2].previousValue, 0);
		assert.equal(changedEventData[3].previousValue, undefined);
		assert.equal(changedEventData[4].previousValue, 0);
	});

	it("Should rollback edits in the correct order: string + 2 directories", () => {
		sharedDir.set("key", 1);
		sharedString.insertText(0, "abcd");
		dir2.set("key", 2);
		try {
			containerRuntime.orderSequentially(() => {
				sharedString.insertText(2, "123");
				dir2.delete("key");
				sharedDir.set("key", 0);
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}
		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false, "Container disposed");
		assert.equal(sharedString.getText(), "abcd");
		assert.equal(sharedDir.size, 1);
		assert.equal(sharedDir.has("key"), true);
		assert.equal(sharedDir.get("key"), 1);
		assert.equal(changedEventData.length, 3);
		assert.equal(changedEventData[0].key, "key");
		assert.equal(changedEventData[0].previousValue, undefined);
		assert.equal(changedEventData[1].key, "key");
		assert.equal(changedEventData[1].previousValue, 1);
		// rollback
		assert.equal(changedEventData[2].key, "key");
		assert.equal(changedEventData[2].previousValue, 0);
		// second directory
		assert.equal(dir2.size, 1);
		assert.equal(dir2.has("key"), true);
		assert.equal(dir2.get("key"), 2);
		assert.equal(changedData2.length, 3);
		assert.equal(changedData2[0].key, "key");
		assert.equal(changedData2[0].previousValue, undefined); // 2
		assert.equal(changedData2[1].key, "key");
		assert.equal(changedData2[1].previousValue, 2); // undefined
		// second directory rollback
		assert.equal(changedData2[2].key, "key");
		assert.equal(changedData2[2].previousValue, undefined); // 2
	});
	it("Should rollback edits in the correct order: string + 2 cells", () => {
		sharedString.insertText(0, "abcd");
		cell2.set("val");
		sharedCell.set("old");
		try {
			containerRuntime.orderSequentially(() => {
				sharedString.removeRange(1, 2);
				sharedCell.set("new");
				sharedString.insertText(0, "123");
				cell2.delete();
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false);
		assert.equal(sharedString.getText(), "abcd");
		assert.equal(sharedCell.get(), "old");
		assert.equal(changedEventData.length, 3);
		assert.equal(changedEventData[0], "old");
		// rollback
		assert.equal(changedEventData[1], "new");
		assert.equal(changedEventData[2], "old");
		// second cell
		assert.equal(cell2.get(), "val");
		assert.equal(changedData2.length, 3);
		assert.equal(changedData2[0], "val");
		// second cell rollback
		assert.equal(changedData2[1], undefined);
		assert.equal(changedData2[2], "val");
	});
	it("Should rollback edits in the correct order: string + 2 maps", () => {
		sharedString.insertText(0, "abcd");
		map2.set("key", 3);
		sharedMap.set("key", 1);
		try {
			containerRuntime.orderSequentially(() => {
				sharedMap.delete("key");
				sharedString.insertText(2, "123");
				sharedString.removeRange(0, 2);
				map2.set("key", 2);
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}
		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false, "Container disposed");
		assert.equal(sharedString.getText(), "abcd");
		assert.equal(sharedMap.has("key"), true);
		assert.equal(sharedMap.size, 1);
		assert.equal(sharedMap.get("key"), 1);
		assert.equal(changedEventData.length, 3);
		assert.equal(changedEventData[0].key, "key");
		assert.equal(changedEventData[0].previousValue, undefined);
		assert.equal(changedEventData[1].key, "key");
		assert.equal(changedEventData[1].previousValue, 1);
		// rollback
		assert.equal(changedEventData[2].key, "key");
		assert.equal(changedEventData[2].previousValue, undefined);
		// second map
		assert.equal(map2.has("key"), true);
		assert.equal(map2.size, 1);
		assert.equal(map2.get("key"), 3);
		assert.equal(changedData2.length, 3);
		assert.equal(changedData2[0].key, "key");
		assert.equal(changedData2[0].previousValue, undefined);
		assert.equal(changedData2[1].key, "key");
		assert.equal(changedData2[1].previousValue, 3);
		// second map rollback
		assert.equal(changedData2[2].key, "key");
		assert.equal(changedData2[2].previousValue, 2);
	});
	it("Should rollback edits in the correct order: 2 strings + directory", () => {
		string2.insertText(0, "12345");
		sharedDir.set("key", 1);
		sharedString.insertText(0, "abcd");
		string2.removeRange(0, 2);
		try {
			containerRuntime.orderSequentially(() => {
				sharedString.insertText(2, "123");
				sharedDir.delete("key");
				string2.removeRange(0, 2);
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}
		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false, "Container disposed");
		assert.equal(sharedString.getText(), "abcd");
		assert.equal(sharedDir.size, 1);
		assert.equal(sharedDir.has("key"), true);
		assert.equal(sharedDir.get("key"), 1);
		assert.equal(changedEventData.length, 3);
		assert.equal(changedEventData[0].key, "key");
		assert.equal(changedEventData[0].previousValue, undefined);
		assert.equal(changedEventData[1].key, "key");
		assert.equal(changedEventData[1].previousValue, 1);
		// rollback
		assert.equal(changedEventData[2].key, "key");
		assert.equal(changedEventData[2].previousValue, undefined);
		// second string
		assert.equal(string2.getText(), "345");
	});
	it("Should rollback edits in the correct order: 2 strings + cell", () => {
		string2.insertText(0, "12345");
		sharedCell.set("val");
		sharedString.insertText(0, "abcd");
		string2.removeRange(0, 2);
		try {
			containerRuntime.orderSequentially(() => {
				sharedString.insertText(2, "123");
				sharedCell.delete();
				string2.removeRange(0, 2);
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}
		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false, "Container disposed");
		assert.equal(sharedString.getText(), "abcd");
		assert.equal(sharedCell.get(), "val");
		assert.equal(changedEventData.length, 3);
		assert.equal(changedEventData[0], "val");
		assert.equal(changedEventData[1], undefined);
		// rollback
		assert.equal(changedEventData[2], "val");
		// second string
		assert.equal(string2.getText(), "345");
	});
	it("Should rollback edits in the correct order: 2 strings + map", () => {
		string2.insertText(0, "12345");
		sharedMap.set("key", 1);
		sharedString.insertText(0, "abcd");
		string2.removeRange(0, 2);
		try {
			containerRuntime.orderSequentially(() => {
				sharedString.insertText(2, "123");
				sharedMap.delete("key");
				string2.removeRange(0, 2);
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}
		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false, "Container disposed");
		assert.equal(sharedString.getText(), "abcd");
		assert.equal(sharedMap.size, 1);
		assert.equal(sharedMap.has("key"), true);
		assert.equal(sharedMap.get("key"), 1);
		assert.equal(changedEventData.length, 3);
		assert.equal(changedEventData[0].key, "key");
		assert.equal(changedEventData[0].previousValue, undefined);
		assert.equal(changedEventData[1].key, "key");
		assert.equal(changedEventData[1].previousValue, 1);
		// rollback
		assert.equal(changedEventData[2].key, "key");
		assert.equal(changedEventData[2].previousValue, undefined);
		// second string
		assert.equal(string2.getText(), "345");
	});
});
