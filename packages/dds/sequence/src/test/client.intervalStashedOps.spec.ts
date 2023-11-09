/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/dot-notation */

import { strict as assert } from "assert";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { IntervalOpType, SequenceInterval } from "../intervals";
import { IIntervalCollection } from "../intervalCollection";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import { assertIntervals } from "./intervalUtils";

describe.skip("Interval Stashed Ops on client ", () => {
	const localUserLongId = "localUser";
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	beforeEach(() => {
		dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
		sharedString = new SharedString(
			dataStoreRuntime1,
			"shared-string-1",
			SharedStringFactory.Attributes,
		);
		containerRuntimeFactory = new MockContainerRuntimeFactory();

		// Connect the first SharedString.
		dataStoreRuntime1.local = false;
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		const services1 = {
			deltaConnection: dataStoreRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		sharedString.initializeLocal();
		sharedString.connect(services1);
	});

	describe("applyStashedOp", () => {
		// might want to want to import/implement assertintervals
		let collection: IIntervalCollection<SequenceInterval>;
		let id: string;
		beforeEach(() => {
			sharedString.insertText(0, "hello world");
			collection = sharedString.getIntervalCollection("test");
			id = collection.add({ start: 0, end: 5, props: { a: 1 } }).getIntervalId();
		});
		it("for add interval", () => {
			const interval = { start: 5, end: 10 };
			const opArgs = {
				type: IntervalOpType.ADD,
				interval,
			};

			const metadata = sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, [interval]);
		});
		it("for delete interval", () => {
			const opArgs = {
				type: IntervalOpType.DELETE,
				id,
			};
			const metadata = sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, []);
			assert.equal(collection.getIntervalById(id), undefined);
		});
		it("for change interval", () => {
			const interval = collection.getIntervalById(id);
			const opArgs = {
				type: IntervalOpType.CHANGE,
				interval,
				newInterval: { start: 5, end: 10 },
			};
			const metadata = sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, [{ start: 5, end: 10 }]);
		});
		it("for interval property change", () => {
			const interval = collection.getIntervalById(id);
			assert(interval !== undefined);
			const opArgs = {
				type: IntervalOpType.PROPERTY_CHANGED,
				interval,
				props: { a: 2 },
			};
			const metadata = sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
			assert.equal(interval.properties.a, 2);
		});
		it("for string position remove", () => {
			const opArgs = {
				type: IntervalOpType.POSITION_REMOVE,
				start: 1,
				end: 5,
			};
			const metadata = sharedString["applyStashedOp"](opArgs);
			assert.equal(sharedString.getText(), "hworld");
			assertIntervals(sharedString, collection, [{ start: 0, end: 0 }]);
		});
	});
});
