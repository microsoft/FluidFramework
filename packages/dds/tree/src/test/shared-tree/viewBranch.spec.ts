/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { CommitOutcome } from "../../core/index.js";
import {
	decideViewSchema,
	retryViewPublication,
	settleViewPublication,
	type ViewPublicationState,
	// eslint-disable-next-line import-x/no-internal-modules -- Tests the internal view-branch decisions.
} from "../../shared-tree/viewBranch.js";
import {
	SchemaFactoryBeta,
	TreeViewConfigurationAlpha,
	toUpgradeSchema,
} from "../../simple-tree/index.js";

import { mintRevisionTag } from "../utils.js";

describe("viewBranch", () => {
	describe("decideViewSchema", () => {
		const sf = new SchemaFactoryBeta("viewBranch");
		const v1 = sf.object("Root", { title: sf.string });
		const v2 = sf.object(
			"Root",
			{ title: sf.string, note: sf.optional(sf.string) },
			{ allowUnknownOptionalFields: true },
		);
		const v3 = sf.object("Root", {
			title: sf.string,
			note: sf.optional(sf.string),
			checked: sf.optional(sf.boolean),
		});

		it("adopts an equivalent received schema", () => {
			const schema = toUpgradeSchema(v2);
			assert.deepEqual(
				decideViewSchema(new TreeViewConfigurationAlpha({ schema: v2 }), schema, schema),
				{ type: "adopt", schema },
			);
		});

		it("keeps the upgrade when the received schema is insufficient", () => {
			const target = toUpgradeSchema(v3);
			assert.deepEqual(
				decideViewSchema(
					new TreeViewConfigurationAlpha({ schema: v3 }),
					toUpgradeSchema(v2),
					target,
				),
				{ type: "upgrade", schema: target },
			);
		});

		it("adopts a covering schema even when upgrading to the local target is not allowed", () => {
			const received = toUpgradeSchema(v3);
			assert.deepEqual(
				decideViewSchema(
					new TreeViewConfigurationAlpha({ schema: v2 }),
					received,
					toUpgradeSchema(v2),
				),
				{ type: "adopt", schema: received },
			);
		});

		it("does not mistake an incompatible expansion for a covering upgrade", () => {
			assert.deepEqual(
				decideViewSchema(
					new TreeViewConfigurationAlpha({ schema: v1 }),
					toUpgradeSchema(v3),
					toUpgradeSchema(v1),
				),
				{ type: "incompatible" },
			);
		});
	});

	describe("publication outcomes", () => {
		function initialPublication(): Extract<ViewPublicationState, { type: "pending" }> {
			return Object.freeze({
				type: "pending",
				revision: mintRevisionTag(),
				attempt: "initial",
			});
		}

		it("accepts a fully applied publication without requesting a retry", () => {
			const state = initialPublication();
			assert.deepEqual(
				settleViewPublication(state, state.revision, CommitOutcome.FullyApplied),
				{ type: "accepted", revision: state.revision },
			);
			assert.equal(state.type, "pending", "The reducer mutated its input.");
		});

		it("requests one retry after rejection and fails after the retry is rejected", () => {
			const initial = initialPublication();
			const rejected = settleViewPublication(
				initial,
				initial.revision,
				CommitOutcome.FullyDropped,
			);
			assert.equal(rejected.type, "retryRequired");
			assert(rejected.type === "retryRequired");
			const revision = mintRevisionTag();
			const retry = retryViewPublication(rejected, revision);

			assert.deepEqual(settleViewPublication(retry, revision, CommitOutcome.FullyDropped), {
				type: "failed",
				revision,
				reason: "retryRejected",
			});
		});

		it("counts a synchronization rollback against the same retry allowance", () => {
			const initial = initialPublication();
			const rolledBack = settleViewPublication(initial, initial.revision, "rollback");
			assert(rolledBack.type === "retryRequired");
			const revision = mintRevisionTag();
			const retry = retryViewPublication(rolledBack, revision);
			assert.deepEqual(settleViewPublication(retry, revision, "rollback"), {
				type: "failed",
				revision,
				reason: "retryRejected",
			});
		});

		it("does not retry a change whose constraints were violated", () => {
			const initial = initialPublication();
			assert.deepEqual(
				settleViewPublication(initial, initial.revision, CommitOutcome.NewContentOnly),
				{
					type: "failed",
					revision: initial.revision,
					reason: "constraintViolation",
				},
			);
		});

		it("ignores duplicate and stale outcomes", () => {
			const initial = initialPublication();
			assert.equal(
				settleViewPublication(initial, mintRevisionTag(), CommitOutcome.FullyDropped),
				initial,
			);
			const rejected = settleViewPublication(
				initial,
				initial.revision,
				CommitOutcome.FullyDropped,
			);
			assert(rejected.type === "retryRequired");
			assert.equal(
				settleViewPublication(rejected, initial.revision, CommitOutcome.FullyDropped),
				rejected,
			);
			const retry = retryViewPublication(rejected, mintRevisionTag());
			assert.equal(
				settleViewPublication(retry, initial.revision, CommitOutcome.FullyApplied),
				retry,
			);
			const accepted = settleViewPublication(
				retry,
				retry.revision,
				CommitOutcome.FullyApplied,
			);
			assert.equal(
				settleViewPublication(accepted, retry.revision, CommitOutcome.FullyDropped),
				accepted,
			);
		});
	});
});
