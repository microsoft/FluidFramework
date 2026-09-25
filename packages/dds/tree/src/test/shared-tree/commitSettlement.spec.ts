/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import-x/no-internal-modules -- Exercise the consumer entrypoints.
import * as beta from "../../entrypoints/beta.js";
// eslint-disable-next-line import-x/no-internal-modules -- Exercise the consumer entrypoints.
import * as legacy from "../../entrypoints/legacy.js";

import { StringArray, TestTreeProviderLite } from "../utils.js";

describe("Commit settlement beta and legacy APIs", () => {
	for (const [name, api] of [
		["beta", beta],
		["legacy", legacy],
	] as const) {
		it(`observes transaction settlement through ${name}`, () => {
			const provider = new TestTreeProviderLite(2);
			const config = new api.TreeViewConfiguration({ schema: StringArray });
			const view = api.asBeta(provider.trees[0].viewWith(config));
			view.initialize([]);
			provider.synchronizeMessages();
			const remoteView = api.asBeta(provider.trees[1].viewWith(config));

			const outcomes: beta.CommitOutcome[] = [];
			let remoteChanges = 0;
			const unsubscribe = view.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					metadata.events.on("settled", (outcome) => outcomes.push(outcome));
				}
			});
			const unsubscribeRemote = remoteView.events.on("changed", (metadata) => {
				assert.equal(metadata.isLocal, false);
				remoteChanges++;
			});

			view.runTransaction(() => {
				view.root.insertAtEnd("first");
				view.root.insertAtEnd("second");
			});
			assert.deepEqual(outcomes, []);
			provider.synchronizeMessages();
			assert.deepEqual(outcomes, [api.CommitOutcome.FullyApplied]);
			assert.equal(remoteChanges, 1);

			unsubscribe();
			unsubscribeRemote();
		});

		it(`observes merged commit settlement through an untyped ${name} view`, () => {
			const provider = new TestTreeProviderLite(1);
			const view = api.asBeta(
				provider.trees[0].viewWith(new api.TreeViewConfiguration({ schema: StringArray })),
			);
			view.initialize([]);
			provider.synchronizeMessages();
			const context = api.TreeBeta.context(view.root);
			assert(context.isView());

			const fork = view.fork();
			fork.root.insertAtEnd("merged");
			const outcomes: beta.CommitOutcome[] = [];
			const unsubscribe = context.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					metadata.events.on("settled", (outcome) => outcomes.push(outcome));
				}
			});
			context.merge(fork);
			assert.deepEqual(outcomes, []);
			provider.synchronizeMessages();
			assert.deepEqual(outcomes, [api.CommitOutcome.FullyApplied]);
			unsubscribe();
		});
	}

	it("keeps experimental change metadata out of the beta API", () => {
		type BetaOnly = Exclude<
			keyof Extract<beta.ChangeMetadataBeta, { isLocal: true }>,
			"kind" | "isLocal" | "events"
		>;
		const noExtraProperties: BetaOnly[] = [];
		// @ts-expect-error Change serialization remains alpha.
		noExtraProperties.push("getChange");
		// @ts-expect-error Advanced undo remains alpha.
		noExtraProperties.push("getRevertible");
		// @ts-expect-error Transaction labels remain alpha.
		noExtraProperties.push("labels");
	});
});
