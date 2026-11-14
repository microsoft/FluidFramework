/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangeAtomId, FieldKey } from "../../../core/index.js";
import {
	FieldKinds,
	genericFieldKind,
	ModularChangeFamily,
	NodeMoveType,
} from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Test fixtures require the internal changeset constructor.
import { newGenericChangeset } from "../../../feature-libraries/modular-schema/genericFieldKindTypes.js";
import {
	isChangesetValid,
	// eslint-disable-next-line import-x/no-internal-modules -- Test internal validation utilities directly.
} from "../../../feature-libraries/modular-schema/modularChangeUtils.js";
import { FluidClientVersion, FormatValidatorBasic } from "../../../index.js";
import { brand } from "../../../util/index.js";
import { failCodecFamily } from "../../utils.js";
// eslint-disable-next-line import-x/no-internal-modules -- Test fixtures use sequence-field mark builders.
import { MarkMaker } from "../sequence-field/testEdits.js";

import { Change } from "./modularChangesetUtil.js";

describe("modularChangeUtils", () => {
	describe("isChangesetValid", () => {
		const field: FieldKey = brand("field");
		const nodeId: ChangeAtomId = { localId: brand(0) };
		const detachId: ChangeAtomId = { localId: brand(1) };
		const fieldKinds = new Map([
			[genericFieldKind.identifier, genericFieldKind],
			[FieldKinds.sequence.identifier, FieldKinds.sequence],
		]);
		const family = new ModularChangeFamily(fieldKinds, failCodecFamily, {
			jsonValidator: FormatValidatorBasic,
			minVersionForCollab: FluidClientVersion.v2_0,
		});

		it("accepts an empty changeset", () => {
			assert.equal(isChangesetValid(Change.empty(), fieldKinds), true);
		});

		it("returns an error for unreachable nodes", () => {
			const change = Change.build(
				{ family },
				Change.field(
					field,
					genericFieldKind.identifier,
					newGenericChangeset(),
					Change.nodeWithId(0, nodeId),
					Change.nodeWithId(1, detachId),
				),
			);
			change.fieldChanges.clear();
			assert.equal(isChangesetValid(change, fieldKinds), "2 unreachable nodes found");
		});

		it("returns an error for unreachable cross-field keys", () => {
			const change = Change.build(
				{ family },
				Change.field(field, FieldKinds.sequence.identifier, [MarkMaker.detach(1, detachId)]),
			);
			change.fieldChanges.clear();
			assert.equal(isChangesetValid(change, fieldKinds), "Unreachable cross-field keys found");
		});

		it("returns an error for a cross-field key missing from the table", () => {
			const change = Change.build(
				{ family },
				Change.field(field, FieldKinds.sequence.identifier, [MarkMaker.detach(1, detachId)]),
			);
			change.crossFieldKeys.clear();
			const key = { localId: detachId.localId, target: NodeMoveType.Detach };
			assert.equal(
				isChangesetValid(change, fieldKinds),
				`Cross-field key ${JSON.stringify(key)} is missing in the cross-field key table`,
			);
		});

		it("returns an error for a cross-field key pointing to the wrong field", () => {
			const change = Change.build(
				{ family },
				Change.field(field, FieldKinds.sequence.identifier, [MarkMaker.detach(1, detachId)]),
			);
			const key = { localId: detachId.localId, target: NodeMoveType.Detach };
			change.crossFieldKeys.set(key, 1, {
				nodeId: undefined,
				field: brand("wrongField"),
			});
			assert.equal(
				isChangesetValid(change, fieldKinds),
				`Cross-field key table is pointing to the wrong field for key ${JSON.stringify(key)}`,
			);
		});

		it("returns an error for a node changeset with no corresponding entry in nodeToParent", () => {
			const change = Change.build(
				{ family },
				Change.field(
					field,
					genericFieldKind.identifier,
					newGenericChangeset(),
					Change.nodeWithId(0, nodeId),
				),
			);
			change.nodeToParent.clear();
			assert.equal(
				isChangesetValid(change, fieldKinds),
				`Missing nodeToParent entry for node change with key ${JSON.stringify([nodeId.revision, nodeId.localId])}`,
			);
		});

		it("returns an error for a root node change with no corresponding entry in nodeToParent", () => {
			const change = Change.build({
				family,
				roots: [{ detachId, change: Change.nodeWithId(0, nodeId) }],
			});
			change.nodeChanges.clear();
			change.nodeToParent.clear();
			assert.equal(
				isChangesetValid(change, fieldKinds),
				`Missing nodeToParent entry for root node change with key ${JSON.stringify(nodeId)}`,
			);
		});

		it("returns an error for an inconsistent root location", () => {
			const change = Change.build({
				family,
				roots: [{ detachId, change: Change.nodeWithId(0, nodeId) }],
			});
			change.nodeToParent.set([nodeId.revision, nodeId.localId], {
				field: { nodeId: undefined, field },
			});
			assert.equal(isChangesetValid(change, fieldKinds), "Inconsistent node location");
		});

		it("returns an error for a child without a location", () => {
			const change = Change.build(
				{ family },
				Change.field(
					field,
					genericFieldKind.identifier,
					newGenericChangeset(),
					Change.nodeWithId(0, nodeId),
				),
			);
			change.nodeChanges.clear();
			change.nodeToParent.clear();
			assert.equal(
				isChangesetValid(change, fieldKinds),
				`NodeId ${JSON.stringify(nodeId)} is missing from the nodeToParent table`,
			);
		});

		it("returns an error for a node reachable in multiple locations", () => {
			const change = Change.build(
				{ family },
				Change.field(
					field,
					genericFieldKind.identifier,
					newGenericChangeset(),
					Change.nodeWithId(0, nodeId),
					Change.nodeWithId(1, nodeId),
				),
			);
			assert.equal(
				isChangesetValid(change, fieldKinds),
				`Node ${JSON.stringify(nodeId)} is reachable in multiple locations`,
			);
		});

		it("propagates errors from nested fields", () => {
			const change = Change.build({
				family,
				roots: [
					{
						detachId: nodeId,
						change: Change.nodeWithId(
							0,
							nodeId,
							Change.field(
								field,
								genericFieldKind.identifier,
								newGenericChangeset(),
								Change.nodeWithId(0, detachId),
							),
						),
					},
				],
			});
			change.nodeChanges.delete([detachId.revision, detachId.localId]);
			change.nodeToParent.delete([detachId.revision, detachId.localId]);
			assert.equal(
				isChangesetValid(change, fieldKinds),
				`NodeId ${JSON.stringify(detachId)} is missing from the nodeToParent table`,
			);
		});

		it("returns an error for an attach without a source", () => {
			const change = Change.build(
				{ family },
				Change.field(field, FieldKinds.sequence.identifier, [MarkMaker.attach(1, nodeId)]),
			);
			assert.equal(
				isChangesetValid(change, fieldKinds),
				"No build, refresher, detach, or rename found for attach",
			);
		});

		it("propagates errors from the remainder of an attach range", () => {
			const change = Change.build(
				{ family },
				Change.field(field, FieldKinds.sequence.identifier, [
					MarkMaker.detach(1, nodeId),
					MarkMaker.attach(2, nodeId),
				]),
			);
			assert.equal(
				isChangesetValid(change, fieldKinds),
				"No build, refresher, detach, or rename found for attach",
			);
		});
	});
});
