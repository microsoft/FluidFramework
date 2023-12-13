/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SequenceDeltaEvent, SharedString } from "@fluidframework/sequence";
import {
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	ChannelFactoryRegistry,
	ITestFluidObject,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IValueChanged, SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedCell } from "@fluidframework/cell";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { Serializable } from "@fluidframework/datastore-definitions";

const stringId = "sharedStringKey";
const string2Id = "sharedString2Key";
const dirId = "sharedDirKey";
const cellId = "cellKey";
const mapId = "mapKey";
const registry: ChannelFactoryRegistry = [
	[stringId, SharedString.getFactory()],
	[string2Id, SharedString.getFactory()],
	[dirId, SharedDirectory.getFactory()],
	[cellId, SharedCell.getFactory()],
	[mapId, SharedMap.getFactory()],
];
const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
};

describeCompat("Multiple DDS orderSequentially", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	let container: IContainer;
	let dataObject: ITestFluidObject;
	let sharedString: SharedString;
	let sharedString2: SharedString;
	let sharedDir: SharedDirectory;
	let sharedCell: SharedCell;
	let sharedMap: SharedMap;
	let changedEventData: (IValueChanged | Serializable<unknown>)[];
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
		dataObject = (await container.getEntryPoint()) as ITestFluidObject;
		sharedString = await dataObject.getSharedObject<SharedString>(stringId);
		sharedString2 = await dataObject.getSharedObject<SharedString>(string2Id);
		sharedDir = await dataObject.getSharedObject<SharedDirectory>(dirId);
		sharedCell = await dataObject.getSharedObject<SharedCell>(cellId);
		sharedMap = await dataObject.getSharedObject<SharedMap>(mapId);

		containerRuntime = dataObject.context.containerRuntime as ContainerRuntime;
		changedEventData = [];
		sharedString.on("sequenceDelta", (changed, _local, _target) => {
			changedEventData.push(changed);
		});
		sharedString2.on("sequenceDelta", (changed, _local, _target) => {
			changedEventData.push(changed);
		});
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
		sharedCell.set(2);
		try {
			containerRuntime.orderSequentially(() => {
				sharedString.removeRange(0, 5);
				sharedMap.delete("key1");
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
		assert.equal(sharedCell.get(), 2);

		assert.equal(changedEventData.length, 9);
		assert(
			changedEventData[0] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[0]}`,
		);

		assert.deepEqual(changedEventData[1], { key: "key1", previousValue: undefined });

		assert.equal(changedEventData[2], 2);

		assert(
			changedEventData[3] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[3]}`,
		);

		assert.deepEqual(changedEventData[4], { key: "key1", previousValue: 0 });

		assert.equal(changedEventData[5], undefined);

		// rollback
		assert.equal(changedEventData[6], 2);

		assert.deepEqual(changedEventData[7], { key: "key1", previousValue: undefined });

		assert(
			changedEventData[8] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[6]}`,
		);
	});

	it("Should rollback complex edits on multiple DDS types", () => {
		sharedString.insertText(0, "abcde");
		sharedMap.set("key1", 0);
		sharedString.annotateRange(2, 5, { foo: "old" });
		sharedCell.set(2);
		try {
			containerRuntime.orderSequentially(() => {
				sharedMap.set("key1", 3);
				sharedString.annotateRange(0, 3, { foo: "new" });
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
		assert.equal(sharedCell.get(), 2);

		assert.equal(changedEventData.length, 17);

		assert(
			changedEventData[0] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[0]}`,
		);

		assert.deepEqual(changedEventData[1], { key: "key1", previousValue: undefined });

		assert(
			changedEventData[2] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[2]}`,
		);

		assert.equal(changedEventData[3], 2);

		assert.deepEqual(changedEventData[4], { key: "key1", previousValue: 0 });

		assert(
			changedEventData[5] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[5]}`,
		);

		assert.equal(changedEventData[6], 5);

		assert(
			changedEventData[7] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[7]}`,
		);

		assert.equal(changedEventData[8], undefined);

		// rollback
		assert.equal(changedEventData[9], 5);

		// segments are split up at some point - reason for multiple events
		assert(
			changedEventData[10] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[10]}`,
		);
		assert(
			changedEventData[11] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[11]}`,
		);
		assert(
			changedEventData[12] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[12]}`,
		);

		assert.equal(changedEventData[13], 2);
		// segments are split up at some point - reason for multiple events
		assert(
			changedEventData[14] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[14]}`,
		);
		assert(
			changedEventData[15] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[15]}`,
		);

		assert.deepEqual(changedEventData[16], { key: "key1", previousValue: 3 });
	});

	it("Should handle rollback on multiple instances of the same DDS type", () => {
		sharedString.insertText(0, "abcde");
		sharedMap.set("key", 1);
		sharedString2.insertText(0, "12345");

		try {
			containerRuntime.orderSequentially(() => {
				sharedMap.delete("key");
				sharedString2.removeRange(0, 2);
				sharedString.insertText(1, "123");
				throw new Error("callback failure");
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false, "Container disposed");
		assert.equal(sharedString.getText(), "abcde");
		assert.equal(sharedString2.getText(), "12345");
		assert.equal(sharedMap.size, 1);
		assert.equal(sharedMap.has("key"), true);
		assert.equal(sharedMap.get("key"), 1);

		assert.equal(changedEventData.length, 9);

		assert(
			changedEventData[0] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[0]}`,
		);

		assert.deepEqual(changedEventData[1], { key: "key", previousValue: undefined });

		assert(
			changedEventData[2] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[2]}`,
		);

		assert.deepEqual(changedEventData[3], { key: "key", previousValue: 1 });

		assert(
			changedEventData[4] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[4]}`,
		);

		assert(
			changedEventData[5] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[5]}`,
		);

		// rollback
		assert(
			changedEventData[6] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[6]}`,
		);

		assert(
			changedEventData[7] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[7]}`,
		);

		assert.deepEqual(changedEventData[8], { key: "key", previousValue: undefined });
	});

	it("Should handle nested calls to orderSequentially", () => {
		sharedString.insertText(0, "abcde");
		sharedMap.set("key", 1);

		try {
			containerRuntime.orderSequentially(() => {
				sharedMap.set("key", 0);
				try {
					containerRuntime.orderSequentially(() => {
						sharedString.removeRange(0, 2);
						throw new Error("callback failure");
					});
				} catch (err) {
					error = err as Error;
				}
				sharedMap.delete("key");
				throw new Error("callback failure");
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false, "Container disposed");
		assert.equal(sharedString.getText(), "abcde");
		assert.equal(sharedMap.size, 1);
		assert.equal(sharedMap.has("key"), true);
		assert.equal(sharedMap.get("key"), 1);

		assert.equal(changedEventData.length, 8);

		assert(
			changedEventData[0] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[0]}`,
		);

		assert.deepEqual(changedEventData[1], { key: "key", previousValue: undefined });

		assert.deepEqual(changedEventData[2], { key: "key", previousValue: 1 });

		assert(
			changedEventData[3] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[3]}`,
		);

		// rollback - inner orderSequentially call
		assert(
			changedEventData[4] instanceof SequenceDeltaEvent,
			`Unexpected event type - ${typeof changedEventData[4]}`,
		);

		assert.deepEqual(changedEventData[5], { key: "key", previousValue: 0 });

		// rollback - outer orderSequentially call
		assert.deepEqual(changedEventData[6], { key: "key", previousValue: undefined });

		assert.deepEqual(changedEventData[7], { key: "key", previousValue: 0 });
	});
});
