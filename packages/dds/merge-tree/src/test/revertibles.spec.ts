/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ReferenceType } from "../ops";
import {
	appendToMergeTreeDeltaRevertibles,
	MergeTreeDeltaRevertible,
	revertMergeTreeDeltaRevertibles,
} from "../revertibles";
import { TrackingGroup, UnorderedTrackingGroup } from "../mergeTreeTracking";
import { createRevertDriver } from "./testClient";
import { createClientsAtInitialState, TestClientLogger } from "./testClientLogger";

/**
 * Run a custom "spy function" every time the given method is invoked.
 * @param methodClass - the class that has the method
 * @param methodName - the name of the method
 * @param spy - the spy function to run alongside the method
 * @returns a function which will remove the spy function when invoked. Should be called exactly once
 * after the spy is no longer needed.
 *
 * This method is duplicated between shared-tree test code, and should eventually
 * be merged with the implementation that lives there
 */
export function spyOnMethod(
	// eslint-disable-next-line @typescript-eslint/ban-types
	methodClass: Function,
	methodName: string,
	spy: () => void,
): () => void {
	const { prototype } = methodClass;
	const method = prototype[methodName];
	assert(typeof method === "function", `Method does not exist: ${methodName}`);

	const methodSpy = function (this: unknown, ...args: unknown[]): unknown {
		spy();
		return method.call(this, ...args);
	};
	prototype[methodName] = methodSpy;

	return () => {
		prototype[methodName] = method;
	};
}

describe("MergeTree.Revertibles", () => {
	it("revert insert", () => {
		const clients = createClientsAtInitialState({ initialState: "123", options: {} }, "A", "B");
		const logger = new TestClientLogger(clients.all);
		let seq = 0;
		const ops: ISequencedDocumentMessage[] = [];

		const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
		const clientBDriver = createRevertDriver(clients.B);
		clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));

		clients.B.on("delta", (op, delta) => {
			appendToMergeTreeDeltaRevertibles(delta, clientB_Revertibles);
		});

		ops.push(clients.B.makeOpMessage(clients.B.insertTextLocal(0, "BB"), ++seq));

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
		logger.validate({ baseText: "BB123" });

		revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
		logger.validate({ baseText: "123" });
	});

	it("has reasonable asymptotics in face of remove", () => {
		const length = 100;

		// track the amount of tracking group linking that occurs
		let linkCount = 0;
		let unlinkCount = 0;

		const unspy1 = spyOnMethod(TrackingGroup, "link", () => (linkCount += 1));
		const unspy2 = spyOnMethod(TrackingGroup, "unlink", () => (unlinkCount += 1));
		const unspy3 = spyOnMethod(UnorderedTrackingGroup, "link", () => (linkCount += 1));
		const unspy4 = spyOnMethod(UnorderedTrackingGroup, "unlink", () => (unlinkCount += 1));

		try {
			const clients = createClientsAtInitialState(
				{
					initialState: "",
					options: {},
				},
				"A",
			);

			for (let i = 1; i <= length; i++) {
				const insertOp = clients.A.insertTextLocal(i - 1, "a");
				clients.A.applyMsg(
					clients.A.makeOpMessage(
						insertOp,
						/* seq */ i + 1,
						/* refSeq */ i,
						clients.A.longClientId,
						/* minSeq */ 1,
					),
				);
			}

			const revertibles: MergeTreeDeltaRevertible[] = [];
			clients.A.on("delta", (_op, delta) => {
				appendToMergeTreeDeltaRevertibles(delta, revertibles);
			});

			const op = clients.A.removeRangeLocal(0, length - 1);

			clients.A.applyMsg(
				clients.A.makeOpMessage(
					op,
					/* seq */ length + 1,
					/* refSeq */ length,
					clients.A.longClientId,
					/* minSeq */ length,
				),
			);

			// the below checks act as a proxy for the asymptotics of undo-redo
			// linking. they are perhaps a bit more strict than necessary. if these
			// tests are failing and the number of calls is still within a sane limit,
			// it should be fine to update these checks to allow a larger number of
			// calls
			assert(
				linkCount <= length * 3,
				`expected tracking group link to occur at most three times per segment. found ${linkCount} instead of ${
					length * 3
				}`,
			);
			assert(
				unlinkCount <= length * 2,
				`expected tracking group unlink to occur at most twice per segment. found ${unlinkCount} instead of ${
					length * 2
				}`,
			);
		} finally {
			unspy1();
			unspy2();
			unspy3();
			unspy4();
		}
	});

	it("revert remove", () => {
		const clients = createClientsAtInitialState({ initialState: "123", options: {} }, "A", "B");
		const logger = new TestClientLogger(clients.all);
		let seq = 0;
		const ops: ISequencedDocumentMessage[] = [];

		const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
		const clientBDriver = createRevertDriver(clients.B);
		clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));

		clients.B.on("delta", (op, delta) => {
			appendToMergeTreeDeltaRevertibles(delta, clientB_Revertibles);
		});

		ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq));

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
		logger.validate({ baseText: "23" });

		revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
		logger.validate({ baseText: "123" });
	});

	for (const { name, removeStart, removeEnd, expectedPostRemove } of [
		{
			name: "revert overlapping remove",
			removeStart: 0,
			removeEnd: 1,
			expectedPostRemove: "23",
		},
		{
			name: "revert overlapping remove of multiple segments",
			removeStart: 0,
			removeEnd: 2,
			expectedPreRemove: "23",
		},
	]) {
		it(name, () => {
			const clients = createClientsAtInitialState(
				{ initialState: "1-23", options: {} },
				"A",
				"B",
				"C",
			);
			const logger = new TestClientLogger(clients.all);
			let seq = 0;
			const ops: ISequencedDocumentMessage[] = [];

			const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
			const clientBDriver = createRevertDriver(clients.B);
			clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));

			clients.B.on("delta", (op, delta) => {
				appendToMergeTreeDeltaRevertibles(delta, clientB_Revertibles);
			});

			ops.push(
				clients.C.makeOpMessage(clients.C.removeRangeLocal(removeStart, removeEnd), ++seq),
			);
			ops.push(
				clients.B.makeOpMessage(clients.B.removeRangeLocal(removeStart, removeEnd), ++seq),
			);

			ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
			logger.validate({ baseText: expectedPostRemove });

			revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

			ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
			logger.validate({ baseText: "123" });
		});
	}

	it("revert two overlapping removes", () => {
		const clients = createClientsAtInitialState(
			{ initialState: "123", options: {} },
			"A",
			"B",
			"C",
		);
		const logger = new TestClientLogger(clients.all);
		let seq = 0;
		const ops: ISequencedDocumentMessage[] = [];

		const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
		const clientBDriver = createRevertDriver(clients.B);
		clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));

		const clientC_Revertibles: MergeTreeDeltaRevertible[] = [];
		const clientCDriver = createRevertDriver(clients.C);
		clientCDriver.submitOpCallback = (op) => ops.push(clients.C.makeOpMessage(op, ++seq));

		clients.B.on("delta", (op, delta) => {
			appendToMergeTreeDeltaRevertibles(delta, clientB_Revertibles);
		});

		clients.C.on("delta", (op, delta) => {
			appendToMergeTreeDeltaRevertibles(delta, clientC_Revertibles);
		});

		ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq));
		ops.push(clients.C.makeOpMessage(clients.C.removeRangeLocal(0, 1), ++seq));

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
		logger.validate({ baseText: "23" });

		revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));
		revertMergeTreeDeltaRevertibles(clientCDriver, clientC_Revertibles.splice(0));

		// "123" would be the ideal final state, but due to current limitations,
		// the eventual consistent state is "1123"
		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
		logger.validate({ baseText: "1123" });
	});

	it("revert annotate", () => {
		const clients = createClientsAtInitialState({ initialState: "123", options: {} }, "A", "B");
		const logger = new TestClientLogger(clients.all);
		let seq = 0;
		const ops: ISequencedDocumentMessage[] = [];

		const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
		const clientBDriver = createRevertDriver(clients.B);
		clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));

		clients.B.on("delta", (op, delta) => {
			appendToMergeTreeDeltaRevertibles(delta, clientB_Revertibles);
		});
		ops.push(clients.B.makeOpMessage(clients.B.annotateRangeLocal(0, 1, { test: 1 }), ++seq));

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
		logger.validate({ baseText: "123" });

		revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
		logger.validate({ baseText: "123" });
	});

	it("Remove All Original Text and Insert then Revert", () => {
		const clients = createClientsAtInitialState(
			{ initialState: "1-2--", options: {} },
			"A",
			"B",
			"C",
		);

		const logger = new TestClientLogger(clients.all);
		let seq = 0;
		const ops: ISequencedDocumentMessage[] = [];

		const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
		// the test logger uses these callbacks, so preserve it
		const clientBDriver = createRevertDriver(clients.B);
		const deltaCallback = (op, delta) => {
			appendToMergeTreeDeltaRevertibles(delta, clientB_Revertibles);
		};
		clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));

		clients.B.on("delta", deltaCallback);
		ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq));
		ops.push(clients.B.makeOpMessage(clients.B.insertTextLocal(0, "BB"), ++seq));
		ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(2, 3), ++seq));

		// revert to the original callback
		clients.B.off("delta", deltaCallback);

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

		revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

		logger.validate({ baseText: "12" });
	});

	it("Re-Insert at position 0 in empty string", () => {
		const clients = createClientsAtInitialState(
			{ initialState: "BBC-", options: {} },
			"A",
			"B",
			"C",
		);

		const logger = new TestClientLogger(clients.all);
		let seq = 0;
		const ops: ISequencedDocumentMessage[] = [];

		const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
		const deltaCallback = (op, delta) => {
			appendToMergeTreeDeltaRevertibles(delta, clientB_Revertibles);
		};
		const clientBDriver = createRevertDriver(clients.B);
		clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));

		clients.B.on("delta", deltaCallback);
		ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(2, 3), ++seq));
		ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq));
		ops.push(clients.B.makeOpMessage(clients.B.insertTextLocal(1, "BB"), ++seq));

		// revert to the original callback
		clients.B.off("delta", deltaCallback);

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

		revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

		logger.validate({ baseText: "BBC" });
	});

	it("Revert remove to empty with annotate", () => {
		const clients = createClientsAtInitialState(
			{ initialState: "1-23--", options: {} },
			"A",
			"B",
			"C",
		);

		const logger = new TestClientLogger(clients.all);
		let seq = 0;
		const ops: ISequencedDocumentMessage[] = [];

		const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
		const deltaCallback = (op, delta) => {
			appendToMergeTreeDeltaRevertibles(delta, clientB_Revertibles);
		};
		const clientBDriver = createRevertDriver(clients.B);
		clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));

		clients.B.on("delta", deltaCallback);
		ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 2), ++seq));
		ops.push(clients.B.makeOpMessage(clients.B.annotateRangeLocal(0, 1, { test: 1 }), ++seq));
		ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq));

		// revert to the original callback
		clients.B.off("delta", deltaCallback);

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

		revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));

		logger.validate({ baseText: "123" });
	});

	it("Revert Local annotate and remove with intersecting remote annotate", () => {
		const clients = createClientsAtInitialState(
			{ initialState: "1234-----", options: {} },
			"A",
			"B",
			"C",
		);

		const logger = new TestClientLogger(clients.all);
		let seq = 0;
		const ops: ISequencedDocumentMessage[] = [];

		const clientB_Revertibles: MergeTreeDeltaRevertible[] = [];
		const deltaCallback = (op, delta) => {
			if (op.sequencedMessage === undefined) {
				appendToMergeTreeDeltaRevertibles(delta, clientB_Revertibles);
			}
		};
		const clientBDriver = createRevertDriver(clients.B);
		clientBDriver.submitOpCallback = (op) => ops.push(clients.B.makeOpMessage(op, ++seq));

		clients.B.on("delta", deltaCallback);
		ops.push(clients.B.makeOpMessage(clients.B.annotateRangeLocal(0, 4, { test: "B" }), ++seq));
		ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(1, 2), ++seq));

		// revert to the original callback
		clients.B.off("delta", deltaCallback);

		ops.push(clients.C.makeOpMessage(clients.C.annotateRangeLocal(3, 4, { test: "C" }), ++seq));

		ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
		logger.validate({ baseText: "134" });

		try {
			revertMergeTreeDeltaRevertibles(clientBDriver, clientB_Revertibles.splice(0));
			ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
		} catch (e) {
			throw logger.addLogsToError(e);
		}

		logger.validate({ baseText: "1234" });
	});

	describe("Revertibles work as expected when a pair of markers and text is involved", () => {
		generatePairwiseOptions({
			revertMarkerInsert: [true, undefined],
			ackMarkerInsert: [true, undefined],
			splitInsertTextRevertible: [true, undefined],
			ackTextInsert: [true, undefined],
			splitRemoveRevertible: [true, undefined],
			ackTextRemove: [true, undefined],
			ackUndo: [true, undefined],
		}).forEach((options) => {
			it(JSON.stringify(options), () => {
				const clients = createClientsAtInitialState(
					{ initialState: "", options: {} },
					"A",
					"B",
				);

				const logger = new TestClientLogger(clients.all);
				let seq = 0;
				const ops: ISequencedDocumentMessage[] = [];

				const clientB_Revertibles: MergeTreeDeltaRevertible[][] = [];
				const openNewUndoRedoTransaction = () => clientB_Revertibles.unshift([]);
				// the test logger uses these callbacks, so preserve it
				const clientBDriver = createRevertDriver(clients.B);
				clientBDriver.submitOpCallback = (op) =>
					ops.push(clients.B.makeOpMessage(op, ++seq));
				clients.B.on("delta", (op, delta) => {
					if (op.sequencedMessage === undefined && clientB_Revertibles.length > 0) {
						appendToMergeTreeDeltaRevertibles(delta, clientB_Revertibles[0]);
					}
				});
				let afterUndoBaseText: string | undefined;
				if (options.revertMarkerInsert) {
					openNewUndoRedoTransaction();
					afterUndoBaseText ??= clients.B.getText();
				}
				ops.push(
					clients.B.makeOpMessage(
						clients.B.insertMarkerLocal(0, ReferenceType.Simple),
						++seq,
					),
				);
				ops.push(
					clients.B.makeOpMessage(
						clients.B.insertMarkerLocal(1, ReferenceType.Simple),
						++seq,
					),
				);

				if (options.ackMarkerInsert) {
					ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
					logger.validate({ baseText: afterUndoBaseText });
				}

				if (options.splitInsertTextRevertible) {
					openNewUndoRedoTransaction();
					afterUndoBaseText ??= clients.B.getText();
				}
				ops.push(clients.B.makeOpMessage(clients.B.insertTextLocal(1, "B"), ++seq));
				if (options.ackTextInsert) {
					ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
					logger.validate({ baseText: "B" });
				}

				if (options.splitRemoveRevertible) {
					openNewUndoRedoTransaction();
					afterUndoBaseText ??= clients.B.getText();
				}

				ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(1, 2), ++seq));
				if (options.ackTextRemove) {
					ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
					logger.validate({ baseText: "" });
				}

				const afterRevertBaseTest = clients.B.getText();
				try {
					const reverts = clientB_Revertibles.splice(0);
					reverts.forEach((revert) => {
						openNewUndoRedoTransaction();
						revertMergeTreeDeltaRevertibles(clientBDriver, revert);
					});
				} catch (e) {
					throw logger.addLogsToError(e);
				}

				if (options.ackUndo) {
					ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
					logger.validate({ baseText: afterUndoBaseText });
				}

				try {
					const reverts = clientB_Revertibles.splice(0);
					reverts.forEach((revert) => {
						revertMergeTreeDeltaRevertibles(clientBDriver, revert);
					});
				} catch (e) {
					throw logger.addLogsToError(e);
				}

				ops.splice(0).forEach((op) => clients.all.forEach((c) => c.applyMsg(op)));
				logger.validate({ baseText: afterRevertBaseTest });
			});
		});
	});
});
