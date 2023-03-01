/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { ChangeSet } from "../changeset";

describe("Map rebase ChangeSets", function () {
	it("Case 1", () => {
		const originalCS = JSON.parse('{"modify":{"NodeProperty":{"a":{"NodeProperty":{"b":{"map<Bool>":{"c":{"modify":{"1":{"value":true,"oldValue":true}}}}}}}}}}');
		const toRebaseCS = JSON.parse('{"modify":{"NodeProperty":{"a":{"NodeProperty":{"b":{"map<Bool>":{"c":{"remove":{"1":true},"modify":{"2":{"value":true,"oldValue":true}}},"d":{"remove":{"1":true}}}}}}}}}');

		const cs = new ChangeSet(toRebaseCS);
		const changes = cs._rebaseChangeSet(originalCS, [], {});
		cs.applyChangeSet(changes);
		// Applying the changes from rebase should have the same effect as applying empty changeset.
		expect(cs.getSerializedChangeSet()).to.equal(toRebaseCS);
	});
});
