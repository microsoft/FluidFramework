/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";
import { cloneDeep } from "lodash";
import { ChangeSet } from "../changeset";

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
});
