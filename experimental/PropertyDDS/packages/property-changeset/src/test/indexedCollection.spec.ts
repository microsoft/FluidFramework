/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import cloneDeep from "lodash/cloneDeep.js";

import { ChangeSet } from "../changeset.js";

describe("Indexed Collection Operations", function () {
	it("modifications should rebase to a NOP for polymorphic collection, when the type of a primitive property changes in the base ChangeSet", () => {
		// Modification to a float property
		const modification = {
			modify: {
				Float64: {
					test: {
						value: 10,
						oldValue: 5,
					},
				},
			},
		};

		// Base Changeset that changes the typeif of the property
		const base = {
			remove: {
				Float64: {
					test: 5,
				},
			},
			insert: {
				String: {
					test: "TestString",
				},
			},
		};

		const conflicts = [];
		new ChangeSet(base)._rebaseChangeSet(modification, conflicts);

		expect(modification).to.be.empty;
	});

	it("creation of a remove/insert changeset should include a 'remove' and 'insert' key", () => {
		// Remove and insert combination with non equal nested changesets
		const base = {
			remove: {
				"test:test-1.0.0": {
					test: {
						"map<Bool>": {
							entries: {
								insert: {
									"914": true,
									"917": false,
									"925": false,
									"86433": false,
									"88790": false,
								},
							},
						},
					},
				},
			},
		};
		const insert = {
			insert: {
				"test:test-1.0.0": {
					test: {
						"map<Bool>": { entries: { insert: { "1": true, "2": false, "3": false } } },
					},
				},
			},
		};

		new ChangeSet(base).applyChangeSet(insert);

		expect(base).to.have.keys("remove", "insert");
	});

	it("modifications should stay unmodified for primitive collections in the case of a insert/remove", () => {
		// Modification to a float property
		const modification = {
			modify: {
				"map<Float64>": {
					test: {
						modify: {
							entry: {
								value: 10,
								oldValue: 5,
							},
						},
					},
				},
			},
		};

		// Base Changeset that changes the typeif of the property
		const base = {
			modify: {
				"map<Float64>": {
					test: {
						remove: {
							entry: 5,
						},
						insert: {
							entry: 9,
						},
					},
				},
			},
		};

		let originalCS = cloneDeep(modification);
		const conflicts = [];
		new ChangeSet(base)._rebaseChangeSet(modification, conflicts);

		expect(modification).to.deep.equal(originalCS);
	});

	it("applying an identical duplicate insert into an indexed collection should be a no-op (CS-003)", () => {
		// Base ChangeSet that already has an insert for key "1"
		const base = {
			insert: {
				"test:test-1.0.0": {
					test: {
						"map<Bool>": { entries: { insert: { "1": true } } },
					},
				},
			},
		};

		// The exact same insert being merged in a second time (e.g. from a duplicated/replayed op)
		const duplicateInsert = cloneDeep(base);

		const expected = cloneDeep(base);

		expect(() => new ChangeSet(base).applyChangeSet(duplicateInsert)).to.not.throw();
		expect(base).to.deep.equal(expected);
	});

	it("applying a conflicting insert for an already-existing key should still throw", () => {
		const base = {
			insert: {
				"test:test-1.0.0": {
					test: {
						"map<Bool>": { entries: { insert: { "1": true } } },
					},
				},
			},
		};

		// Same key, different value: a genuine conflict, not a duplicate/replay
		const conflictingInsert = {
			insert: {
				"test:test-1.0.0": {
					test: {
						"map<Bool>": { entries: { insert: { "1": false } } },
					},
				},
			},
		};

		expect(() => new ChangeSet(base).applyChangeSet(conflictingInsert)).to.throw(
			/Added an already existing entry/,
		);
	});
});
