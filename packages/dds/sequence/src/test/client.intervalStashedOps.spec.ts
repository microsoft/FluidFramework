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
import { IMapValueTypeOperation } from "../defaultMap";
import { assertIntervals } from "./intervalUtils";

describe.only("Interval Stashed Ops on client ", () => {
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

	describe.only("applyStashedOp", () => {
		let collection: IIntervalCollection<SequenceInterval>;
		let intervalId: string;
		const label = "test";
		let startingInterval;
		let startingIntervalWithProps;
		beforeEach(() => {
			sharedString.insertText(0, "hello world");
			collection = sharedString.getIntervalCollection(label);
			startingInterval = { start: 0, end: 5 };
			startingIntervalWithProps = { ...startingInterval, props: { a: 1 } };
			intervalId = collection.add(startingInterval).getIntervalId();
		});
		it("for add interval", () => {
			const interval = { start: 5, end: 10 };
			const opArgs: IMapValueTypeOperation = {
				key: label,
				type: "act",
				value: {
					opName: IntervalOpType.ADD,
					value: interval,
				},
			};

			const metadata = sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, [startingInterval, interval]);
		});
		it("for delete interval", () => {
			const opArgs: IMapValueTypeOperation = {
				key: label,
				type: "act",
				value: {
					opName: IntervalOpType.DELETE,
					value: { properties: { intervalId } },
				},
			};
			const metadata = sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, []);
			assert.equal(collection.getIntervalById(intervalId), undefined);
		});
		it("for change interval", () => {
			const opArgs: IMapValueTypeOperation = {
				key: label,
				type: "act",
				value: {
					opName: IntervalOpType.CHANGE,
					value: { start: 5, end: 10, properties: { intervalId } },
				},
			};
			const metadata = sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, [{ start: 5, end: 10 }]);
		});
		it("for interval property change", () => {
			const interval = collection.getIntervalById(intervalId);
			assert(interval !== undefined);
			const opArgs: IMapValueTypeOperation = {
				key: label,
				type: "act",
				value: {
					opName: IntervalOpType.PROPERTY_CHANGED,
					value: { properties: { intervalId, a: 2 } },
				},
			};
			const metadata = sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
			assert.equal(interval.properties.a, 2);
		});
		it("for string position remove", () => {
			const opArgs: IMapValueTypeOperation = {
				key: label,
				type: "act",
				value: {
					opName: IntervalOpType.POSITION_REMOVE,
					value: { start: 1, end: 5, properties: { intervalId } },
				},
			};
			const metadata = sharedString["applyStashedOp"](opArgs);
			assert.equal(sharedString.getText(), "h world");
			assertIntervals(sharedString, collection, [{ start: 0, end: 1 }]);
		});
	});
});
