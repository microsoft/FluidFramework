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
import { Jsonable } from "@fluidframework/datastore-definitions";
import { SharedJson1, Json1Factory } from "..";

const createLocalOT = (id: string) => {
	const factory = SharedJson1.getFactory();
	return factory.create(new MockFluidDataStoreRuntime(), id) as SharedJson1;
};

function createConnectedOT(id: string, runtimeFactory: MockContainerRuntimeFactory) {
	// Create and connect a second SharedCell.
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const ot = new SharedJson1(id, dataStoreRuntime, (Json1Factory as any).Attributes);
	ot.connect(services);
	return ot;
}

interface ITestObject {
	x: number;
	y: number;
}

describe("SharedJson1", () => {
	describe("Local state", () => {
		let ot: SharedJson1;

		beforeEach(() => {
			ot = createLocalOT("OT");
			ot.replace([], null, {});
		});

		const expect = <T>(expected: Jsonable<T>) => {
			assert.deepEqual(ot.get(), expected);
		};

		describe("APIs", () => {
			it("Can create a OT", () => {
				assert.ok(ot, "Could not create a OT");
			});

			describe("insert()", () => {
				it("number", () => {
					ot.insert(["x"], 1);
					expect({ x: 1 });
				});

				it("array", () => {
					ot.insert(["x"], []);
					expect({ x: [] });
				});

				it("into array", () => {
					ot.insert(["x"], []);
					expect({ x: [] });

					ot.insert(["x", 0], 1);
					expect({ x: [1] });
				});

				it("object", () => {
					const obj: ITestObject = { x: 1, y: 2 };
					ot.insert(["o"], obj);
					expect({ o: { x: 1, y: 2 } });
				});
			});

			describe("remove()", () => {
				it("property from root object", () => {
					ot.insert(["x"], 1);
					ot.remove(["x"]);
					expect({});
				});
			});

			describe("replace()", () => {
				it("property on root object", () => {
					ot.insert(["x"], 1);
					ot.replace(["x"], 1, 2);
					expect({ x: 2 });
				});
			});

			describe("move", () => {
				it("between properties on root object", () => {
					ot.insert(["x"], 1);
					ot.move(["x"], ["y"]);
					expect({ y: 1 });
				});
			});
		});
	});

	describe("Connected state", () => {
		let doc1: SharedJson1;
		let doc2: SharedJson1;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		describe("APIs", () => {
			beforeEach(() => {
				containerRuntimeFactory = new MockContainerRuntimeFactory();
				doc1 = createConnectedOT("OT1", containerRuntimeFactory);
				doc2 = createConnectedOT("OT2", containerRuntimeFactory);
				doc1.replace([], null, []);
				expect([]);
			});

			const expect = <T>(expected?: Jsonable<T>) => {
				containerRuntimeFactory.processAllMessages();

				const actual1 = doc1.get();
				const actual2 = doc2.get();

				assert.deepEqual(
					actual1,
					actual2,
					`docs must converge (doc1: '${actual1}', doc2: '${actual2}'${
						expected !== undefined ? ` expected: '${expected}'` : ""
					})`,
				);

				if (expected !== undefined) {
					assert.deepEqual(
						actual1,
						expected,
						`docs must match expected (expected '${expected}', but got '${actual1}')`,
					);
				}
			};

			it("insertion race 2 before 1", () => {
				doc1.insert([0], 0);
				doc1.insert([1], 3);
				expect([0, 3]);

				doc1.insert([1], 2);
				doc2.insert([1], 1);
				expect([0, 1, 2, 3]);
			});

			it("insertion race 1 before 2", () => {
				doc1.insert([0], 0);
				doc1.insert([1], 3);
				expect([0, 3]);

				doc2.insert([1], 1);
				doc1.insert([1], 2);
				expect([0, 2, 1, 3]);
			});

			it("insertion race with adjacent insert", () => {
				doc1.insert([0], 1);
				doc2.insert([0], 0);
				doc2.insert([1], 2);
				expect([0, 1, 2]);
			});

			it("insert vs. remove conflict", () => {
				doc1.insert([0], 0);
				doc1.insert([1], 2);
				doc1.insert([2], 3);
				expect([0, 2, 3]);

				doc1.insert([1], 1);
				doc2.remove([1]);
				expect([0, 1, 3]);
			});

			it("remove vs. insert conflict", () => {
				doc1.insert([0], 0);
				doc1.insert([1], 2);
				doc1.insert([2], 3);
				expect([0, 2, 3]);

				doc1.remove([1]);
				doc2.insert([1], 1);
				expect([0, 1, 3]);
			});

			it("overlapping remove", () => {
				doc1.insert([0], 0);
				doc1.insert([1], 1);
				doc1.insert([2], 2);
				doc1.insert([3], 3);
				expect([0, 1, 2, 3]);

				doc1.remove([1]);
				doc1.remove([1]);
				doc2.remove([2]);
				expect([0, 3]);
			});
		});
	});
});
