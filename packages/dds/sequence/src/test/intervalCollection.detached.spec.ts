/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { TextSegment } from "@fluidframework/merge-tree";
import { SharedString } from "../sharedString";
import { IntervalType, SequenceInterval } from "../intervals";
import { IIntervalCollection } from "../intervalCollection";
import { assertEquivalentSharedStrings } from "./intervalUtils";

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
		const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
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
			const interval = collection.add(0, 2, IntervalType.SlideOnRemove);
			sharedString.removeText(2, 3);
			assert.equal((interval.end.getSegment() as TextSegment)?.text, "3");
		});

		it("synchronizes correctly on another client", async () => {
			sharedString.insertText(0, "0123");
			collection.add(0, 2, IntervalType.SlideOnRemove);
			const { sharedString2, containerRuntimeFactory } =
				await attachAndLoadSecondSharedString();

			sharedString2.removeText(2, 3);
			containerRuntimeFactory.processAllMessages();
			assertEquivalentSharedStrings(sharedString, sharedString2);
		});

		it("can be changed by another client after attaching", async () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add(0, 2, IntervalType.SlideOnRemove);
			const { sharedString2, containerRuntimeFactory } =
				await attachAndLoadSecondSharedString();

			const collection2 = sharedString2.getIntervalCollection("intervals");
			collection2.change(interval.getIntervalId(), 1, 1);
			containerRuntimeFactory.processAllMessages();
			assertEquivalentSharedStrings(sharedString, sharedString2);
		});
	});

	describe("interval changed while detached", () => {
		it("slides immediately on segment removal", () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add(0, 2, IntervalType.SlideOnRemove);
			collection.change(interval.getIntervalId(), 0, 0);
			sharedString.removeText(0, 1);
			assert.equal((interval.start.getSegment() as TextSegment)?.text, "123");
			assert.equal((interval.end.getSegment() as TextSegment)?.text, "123");
		});

		it("synchronizes correctly on another client", async () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add(0, 2, IntervalType.SlideOnRemove);
			collection.change(interval.getIntervalId(), 0, 0);
			const { sharedString2, containerRuntimeFactory } =
				await attachAndLoadSecondSharedString();

			sharedString2.removeText(0, 1);
			containerRuntimeFactory.processAllMessages();
			assertEquivalentSharedStrings(sharedString, sharedString2);
		});

		it("can be changed by another client after attaching", async () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add(0, 2, IntervalType.SlideOnRemove);
			collection.change(interval.getIntervalId(), 0, 0);
			const { sharedString2, containerRuntimeFactory } =
				await attachAndLoadSecondSharedString();

			const collection2 = sharedString2.getIntervalCollection("intervals");
			collection2.change(interval.getIntervalId(), 1, 1);
			containerRuntimeFactory.processAllMessages();
			assertEquivalentSharedStrings(sharedString, sharedString2);
		});
	});

	describe("intervals deleted while detached", () => {
		it("aren't added to the remote client", async () => {
			sharedString.insertText(0, "0123");
			const interval = collection.add(0, 2, IntervalType.SlideOnRemove);
			const id = interval.getIntervalId();
			collection.removeIntervalById(id);
			const { sharedString2 } = await attachAndLoadSecondSharedString();

			const collection2 = sharedString2.getIntervalCollection("intervals");
			assert.equal(Array.from(collection2).length, 0);
			assert.equal(collection2.getIntervalById(id), undefined);
			assertEquivalentSharedStrings(sharedString, sharedString2);
		});
	});
});
