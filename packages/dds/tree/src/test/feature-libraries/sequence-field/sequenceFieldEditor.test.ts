/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangesetLocalId } from "../../../core/index.js";
import { brand } from "../../../util/index.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";
import { MarkMaker as Mark } from "./testEdits.js";
import { mintRevisionTag } from "../../utils.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { Changeset } from "../../../feature-libraries/sequence-field/types.js";
// eslint-disable-next-line import-x/no-internal-modules
import { sequenceFieldEditor } from "../../../feature-libraries/sequence-field/sequenceFieldEditor.js";

const id: ChangesetLocalId = brand(0);

export function testEditor(): void {
	describe("Editor", () => {
		it("empty child changes", () => {
			assert.deepEqual(sequenceFieldEditor.buildChildChanges([]), []);
		});

		it("child changes", () => {
			const childChange1 = {
				localId: brand<ChangesetLocalId>(0),
				revision: mintRevisionTag(),
			};
			const childChange2 = {
				localId: brand<ChangesetLocalId>(1),
				revision: mintRevisionTag(),
			};
			const childChange3 = {
				localId: brand<ChangesetLocalId>(2),
				revision: mintRevisionTag(),
			};
			deepFreeze(childChange1);
			deepFreeze(childChange2);
			deepFreeze(childChange3);
			const actual = sequenceFieldEditor.buildChildChanges([
				[1, childChange1],
				[4, childChange2],
				[10, childChange3],
			]);
			const expected: Changeset = [
				{ count: 1 },
				Mark.modify(childChange1),
				{ count: 2 },
				Mark.modify(childChange2),
				{ count: 5 },
				Mark.modify(childChange3),
			];
			assert.deepEqual(actual, expected);
		});

		it("insert one node", () => {
			const revision = mintRevisionTag();
			const actual = sequenceFieldEditor.insert(
				42,
				1,
				{ localId: id, revision },
				revision,
				id,
			);
			const expected: Changeset = [
				{ count: 42 },
				Mark.revive(1, { localId: id, revision }, { revision }),
			];
			assert.deepEqual(actual, expected);
		});

		it("insert multiple nodes", () => {
			const revision = mintRevisionTag();
			const actual = sequenceFieldEditor.insert(
				42,
				2,
				{ localId: id, revision },
				revision,
				id,
			);
			const expected: Changeset = [
				{ count: 42 },
				Mark.insert(2, { localId: id, revision }, { revision }),
			];
			assert.deepEqual(actual, expected);
		});

		it("remove", () => {
			const revision = mintRevisionTag();
			const actual = sequenceFieldEditor.remove(42, 3, id, revision);
			const expected: Changeset = [{ count: 42 }, Mark.remove(3, id, { revision })];
			assert.deepEqual(actual, expected);
		});
	});
}
