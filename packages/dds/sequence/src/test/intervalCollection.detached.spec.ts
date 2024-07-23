/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { TextSegment } from "@fluidframework/merge-tree/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { IIntervalCollection } from "../intervalCollection.js";
import { SequenceInterval } from "../intervals/index.js";
import { SharedString } from "../sequenceFactory.js";

import { assertEquivalentSharedStrings } from "./intervalTestUtils.js";

describe("IntervalCollection detached", () => {
	const factory = SharedString.getFactory();
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let sharedString: SharedString;
	let collection: IIntervalCollection<SequenceInterval>;
	beforeEach(() => {
		dataStoreRuntime = new MockFluidDataStoreRuntime();
		sharedString = factory.create(dataStoreRuntime, "A");
		collection = sharedString.getIntervalCollection("intervals");
	});

	const attachAndLoadSecondSharedString = async (): Promise<{
		containerRuntimeFactory: MockContainerRuntimeFactory;
		sharedString2: SharedString;
	}> => {
		assert.equal(sharedString.isAttached(), false);
		const containerRuntimeFactory = new MockContainerRuntimeFactory();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
		const attachSummary = sharedString.getAttachSummary().summary;
		sharedString.connect({
			deltaConnection: containerRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
		const containerRuntime2 =
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		const sharedString2 = await factory.load(
			dataStoreRuntime2,
			"B",
			{
				deltaConnection: containerRuntime2.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(attachSummary),
			},
			factory.attributes,
		);
		return { sharedString2, containerRuntimeFactory };
	};

	describe("interval created while detached", () => {
		it("slides immediately on segment removal", () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add({ start: 0, end: 2 });
			sharedString.removeText(2, 3);
			assert.equal((interval.end.getSegment() as TextSegment)?.text, "3");
		});

		it("synchronizes correctly on another client", async () => {
			sharedString.insertText(0, "0123");
			collection.add({ start: 0, end: 2 });
			const { sharedString2, containerRuntimeFactory } =
				await attachAndLoadSecondSharedString();

			sharedString2.removeText(2, 3);
			containerRuntimeFactory.processAllMessages();
			await assertEquivalentSharedStrings(sharedString, sharedString2);
		});

		it("can be changed by another client after attaching", async () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add({ start: 0, end: 2 });
			const { sharedString2, containerRuntimeFactory } =
				await attachAndLoadSecondSharedString();

			const collection2 = sharedString2.getIntervalCollection("intervals");
			collection2.change(interval.getIntervalId(), { start: 1, end: 1 });
			containerRuntimeFactory.processAllMessages();
			await assertEquivalentSharedStrings(sharedString, sharedString2);
		});
	});

	describe("interval changed while detached", () => {
		it("slides immediately on segment removal", () => {
			sharedString.insertText(0, "0123");
			const id = collection.add({ start: 0, end: 2 }).getIntervalId();
			collection.change(id, { start: 0, end: 0 });
			sharedString.removeText(0, 1);
			const interval = collection.getIntervalById(id);
			assert(interval !== undefined, "interval should be defined");
			assert.equal((interval.start.getSegment() as TextSegment)?.text, "123");
			assert.equal((interval.end.getSegment() as TextSegment)?.text, "123");
		});

		it("synchronizes correctly on another client", async () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add({ start: 0, end: 2 });
			collection.change(interval.getIntervalId(), { start: 0, end: 0 });
			const { sharedString2, containerRuntimeFactory } =
				await attachAndLoadSecondSharedString();

			sharedString2.removeText(0, 1);
			containerRuntimeFactory.processAllMessages();
			await assertEquivalentSharedStrings(sharedString, sharedString2);
		});

		it("can be changed by another client after attaching", async () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add({ start: 0, end: 2 });
			collection.change(interval.getIntervalId(), { start: 0, end: 0 });
			const { sharedString2, containerRuntimeFactory } =
				await attachAndLoadSecondSharedString();

			const collection2 = sharedString2.getIntervalCollection("intervals");
			collection2.change(interval.getIntervalId(), { start: 1, end: 1 });
			containerRuntimeFactory.processAllMessages();
			await assertEquivalentSharedStrings(sharedString, sharedString2);
		});
	});

	describe("interval with properties changed while detached", () => {
		it("synchronizes correctly on another client", async () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add({ start: 0, end: 2, props: { foo: "a1" } });
			collection.change(interval.getIntervalId(), { props: { foo: "a2" } });
			const { sharedString2, containerRuntimeFactory } =
				await attachAndLoadSecondSharedString();

			containerRuntimeFactory.processAllMessages();
			await assertEquivalentSharedStrings(sharedString, sharedString2);
			assert.equal(collection.getIntervalById(interval.getIntervalId())?.properties.foo, "a2");
		});

		it("can be changed by another client after attaching", async () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add({ start: 0, end: 2, props: { foo: "a1" } });
			collection.change(interval.getIntervalId(), { props: { foo: "a2" } });
			const { sharedString2, containerRuntimeFactory } =
				await attachAndLoadSecondSharedString();

			const collection2 = sharedString2.getIntervalCollection("intervals");
			collection2.change(interval.getIntervalId(), { props: { foo: "b1" } });
			containerRuntimeFactory.processAllMessages();

			await assertEquivalentSharedStrings(sharedString, sharedString2);
			assert.equal(collection.getIntervalById(interval.getIntervalId())?.properties.foo, "b1");
		});
	});

	describe("intervals deleted while detached", () => {
		it("aren't added to the remote client", async () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add({ start: 0, end: 2 });
			const id = interval.getIntervalId();
			collection.removeIntervalById(id);
			const { sharedString2 } = await attachAndLoadSecondSharedString();

			const collection2 = sharedString2.getIntervalCollection("intervals");
			assert.equal(Array.from(collection2).length, 0);
			assert.equal(collection2.getIntervalById(id), undefined);
			await assertEquivalentSharedStrings(sharedString, sharedString2);
		});
	});
});
