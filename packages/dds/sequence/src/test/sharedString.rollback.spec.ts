/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { AttachState } from "@fluidframework/container-definitions/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedStringFactory } from "../sequenceFactory.js";
import { SharedStringClass } from "../sharedString.js";

function setupSharedStringRollbackTest() {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({ flushMode: 1 }); // TurnBased
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedString = new SharedStringClass(
		dataStoreRuntime,
		"shared-string-1",
		SharedStringFactory.Attributes,
	);
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedString.initializeLocal();
	sharedString.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return {
		sharedString,
		dataStoreRuntime,
		containerRuntimeFactory,
		containerRuntime,
	};
}

describe("SharedString with rollback", () => {
	it("should rollback text insert operation", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime } =
			setupSharedStringRollbackTest();

		// Initial text
		sharedString.insertText(0, "abc");
		assert.equal(sharedString.getText(), "abc", "text after insert");
		// containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		// Insert new text we plan to roll back
		sharedString.insertText(3, "XYZ");
		assert.equal(sharedString.getText(), "abcXYZ", "text after insert");

		// Rollback should revert the insert
		containerRuntime.rollback?.();
		assert.equal(sharedString.getText(), "", "text reverted after rollback");
	});

	it("can replace text with rollback", async () => {
		const { sharedString, containerRuntimeFactory, containerRuntime } =
			setupSharedStringRollbackTest();
		sharedString.insertText(0, "hello world");

		sharedString.replaceText(6, 11, "there!");
		assert.equal(sharedString.getText(), "hello there!", "Could not replace text");

		containerRuntimeFactory.processAllMessages();

		sharedString.replaceText(0, 5, "hi");
		assert.equal(sharedString.getText(), "hi there!", "Could not replace text at beginning");

		containerRuntime.rollback?.();
		assert.equal(sharedString.getText(), "", "text reverted after rollback");
	});

	it("can remove text with rollback", async () => {
		const { sharedString, containerRuntimeFactory, containerRuntime } =
			setupSharedStringRollbackTest();
		sharedString.insertText(0, "hello world");

		sharedString.removeText(5, 11);
		assert.equal(sharedString.getText(), "hello", "Could not remove text");

		sharedString.removeText(0, 3);
		assert.equal(sharedString.getText(), "lo", "Could not remove text from beginning");
		containerRuntimeFactory.processAllMessages();

		containerRuntime.rollback?.();

		assert.equal(sharedString.getText(), "", "text reverted after rollback");
	});

	it("can annotate the text", async () => {
		const { sharedString, containerRuntimeFactory, containerRuntime } =
			setupSharedStringRollbackTest();
		const text = "hello world";
		const styleProps = { style: "bold" };
		sharedString.insertText(0, text, styleProps);

		for (let i = 0; i < text.length; i++) {
			assert.deepEqual(
				{ ...sharedString.getPropertiesAtPosition(i) },
				{ ...styleProps },
				"Could not add props",
			);
		}

		const colorProps = { color: "green" };
		sharedString.annotateRange(6, text.length, colorProps);

		for (let i = 6; i < text.length; i++) {
			assert.deepEqual(
				{ ...sharedString.getPropertiesAtPosition(i) },
				{ ...styleProps, ...colorProps },
				"Could not annotate props",
			);
		}

		containerRuntimeFactory.processAllMessages();

		containerRuntime.rollback?.();

		assert.equal(sharedString.getText(), "", "text reverted after rollback");
	});
});
