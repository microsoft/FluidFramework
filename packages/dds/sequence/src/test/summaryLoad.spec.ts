/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import { ReferenceType } from "@fluidframework/merge-tree/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedString, SharedStringClass } from "../index.js";
import { SharedStringFactory } from "../sequenceFactory.js";

function applyOperations(
	sharedString: SharedString,
	content = sharedString.getLength().toString(),
) {
	const lenMod = sharedString.getLength() % 4;
	switch (lenMod) {
		case 0:
			sharedString.insertText(0, content);
			break;

		case 1: {
			const pos = Math.floor(sharedString.getLength() / lenMod);
			sharedString.insertMarker(pos, ReferenceType.Simple);
			break;
		}

		case 2: {
			sharedString.insertText(sharedString.getLength(), content);
			const pos = Math.floor(sharedString.getLength() / lenMod);
			sharedString.removeText(pos, pos + 1);
			// fall through to insert after remove
		}
		default:
			sharedString.insertText(sharedString.getLength(), content);
	}
}

const mergeTreeSnapshotChunkSize = 5;

function generateSummaryTree(
	containerRuntimeFactory: MockContainerRuntimeFactory,
	options: any = {},
): [SharedString, ISummaryTree] {
	const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
	dataStoreRuntime1.options = options;
	// Connect the first SharedString.
	containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
	const services1: IChannelServices = {
		deltaConnection: dataStoreRuntime1.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};
	const sharedString = new SharedStringClass(
		dataStoreRuntime1,
		"shared-string",
		SharedStringFactory.Attributes,
	);
	sharedString.initializeLocal();
	sharedString.connect(services1);

	// Create and connect a second SharedString.
	const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
	dataStoreRuntime2.options = options;
	containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
	const sharedString2 = new SharedStringClass(
		dataStoreRuntime2,
		"shared-string",
		SharedStringFactory.Attributes,
	);
	const services2: IChannelServices = {
		deltaConnection: dataStoreRuntime2.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};
	sharedString2.initializeLocal();
	sharedString2.connect(services2);

	while (sharedString.getLength() < mergeTreeSnapshotChunkSize * 3) {
		applyOperations(sharedString);
		containerRuntimeFactory.processAllMessages();
	}
	assert.equal(sharedString2.getText(), sharedString.getText());
	const summaryTree = sharedString2.getAttachSummary().summary;
	assert(summaryTree);
	return [sharedString2, summaryTree];
}

describe("SharedString Summary Load", () => {
	it("Validate Summary Load", async () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory();
		const options = { mergeTreeSnapshotChunkSize };
		const [remoteSharedString, summaryTree] = generateSummaryTree(
			containerRuntimeFactory,
			options,
		);

		const localDataStoreRuntime = new MockFluidDataStoreRuntime();
		localDataStoreRuntime.options = options;
		containerRuntimeFactory.createContainerRuntime(localDataStoreRuntime);
		const localServices = {
			deltaConnection: localDataStoreRuntime.createDeltaConnection(),
			objectStorage: MockStorage.createFromSummary(summaryTree),
		};
		const localSharedString = new SharedStringClass(
			localDataStoreRuntime,
			"shared-string",
			SharedStringFactory.Attributes,
		);

		await localSharedString.load(localServices);

		assert.equal(localSharedString.getText(), remoteSharedString.getText());
	});

	it("Validate New Format Load", async () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory();
		const options = { newMergeTreeSnapshotFormat: true, mergeTreeSnapshotChunkSize };
		const [remoteSharedString, summaryTree] = generateSummaryTree(
			containerRuntimeFactory,
			options,
		);

		const localDataStoreRuntime = new MockFluidDataStoreRuntime();
		localDataStoreRuntime.options = options;
		containerRuntimeFactory.createContainerRuntime(localDataStoreRuntime);
		const localServices = {
			deltaConnection: localDataStoreRuntime.createDeltaConnection(),
			objectStorage: MockStorage.createFromSummary(summaryTree),
		};
		const localSharedString = new SharedStringClass(
			localDataStoreRuntime,
			"shared-string",
			SharedStringFactory.Attributes,
		);

		await localSharedString.load(localServices);

		assert.equal(localSharedString.getText(), remoteSharedString.getText());
	});
});
