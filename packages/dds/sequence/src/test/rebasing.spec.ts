/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactory,
	MockContainerRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { IMergeTreeInsertMsg } from "@fluidframework/merge-tree";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { AttachState } from "@fluidframework/container-definitions";
import { SharedString } from "../sharedString.js";
import { SharedStringFactory } from "../sequenceFactory.js";

[
	{
		options: {
			flushMode: FlushMode.Immediate,
		},
		name: "FlushMode immediate",
	},
	{
		options: {
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		},
		name: "FlushMode TurnBased with grouped batching",
	},
].forEach((testConfig) => {
	describe(`Rebasing - ${testConfig.name}`, () => {
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		let containerRuntime1: MockContainerRuntime;
		let containerRuntime2: MockContainerRuntime;
		let sharedString1: SharedString;
		let sharedString2: SharedString;

		const createSharedString = async (
			id: string,
			factory: MockContainerRuntimeFactory,
		): Promise<[SharedString, MockContainerRuntime]> => {
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			dataStoreRuntime.setAttachState(AttachState.Attached);
			const containerRuntime = factory.createContainerRuntime(dataStoreRuntime);
			const services = {
				deltaConnection: dataStoreRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			const sharedString = new SharedString(
				dataStoreRuntime,
				id,
				SharedStringFactory.Attributes,
			);
			sharedString.initializeLocal();
			sharedString.connect(services);
			return [sharedString, containerRuntime];
		};

		beforeEach(async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactory(testConfig.options);
			[sharedString1, containerRuntime1] = await createSharedString(
				"shared-string-1",
				containerRuntimeFactory,
			);
			[sharedString2, containerRuntime2] = await createSharedString(
				"shared-string-2",
				containerRuntimeFactory,
			);
		});

		it("Rebasing ops maintains eventual consistency", async () => {
			sharedString1.insertText(0, "ad");
			sharedString1.insertText(1, "c");
			containerRuntime1.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			sharedString2.on("sequenceDelta", (sequenceDeltaEvent) => {
				if ((sequenceDeltaEvent.opArgs.op as IMergeTreeInsertMsg).seg === "b") {
					sharedString2.insertText(3, "u");
				}
			});

			sharedString1.insertText(1, "b");
			sharedString2.insertText(0, "y");
			sharedString2.insertText(1, "w");
			containerRuntime1.rebase();
			containerRuntime1.flush();
			containerRuntimeFactory.processOneMessage();
			sharedString2.insertText(2, "v");

			containerRuntime2.rebase();
			containerRuntime1.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			sharedString2.insertText(0, "z");
			containerRuntime1.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString1.getText(), "zywvaubcd");
			assert.strictEqual(
				sharedString1.getText(),
				sharedString2.getText(),
				"SharedString eventual consistency broken",
			);
		});
	});
});
