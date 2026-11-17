/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	defaultSchemaPolicy,
	// Allow import from file being tested.
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/default-schema/defaultFieldKinds.js";
import type { FullSchemaPolicy } from "../../../feature-libraries/index.js";
import {
	allowsMultiplicitySuperset,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
// eslint-disable-next-line import-x/no-internal-modules

/**
 * Test suite that a given FullSchemaPolicy has valid field kind relationships.
 */
function validateFieldKindSet(policy: FullSchemaPolicy): void {
	describe("validateFieldKindSet", () => {
		for (const [key, kind] of policy.fieldKinds) {
			describe(key, () => {
				it("correct key", () => {
					assert.equal(key, kind.identifier);
				});

				it("valid migrations", () => {
					const s = kind.options.allowMonotonicUpgradeFrom;
					assert(s.has(kind.identifier) === false);
					for (const other of s) {
						const referenced = policy.fieldKinds.get(other);
						assert(referenced !== undefined);

						assert(allowsMultiplicitySuperset(referenced.multiplicity, kind.multiplicity));

						for (const otherKey of referenced.options.allowMonotonicUpgradeFrom) {
							assert(
								s.has(otherKey) === true,
								`Missing migration from ${otherKey} to ${key}: it is transitively allowed via ${other} but not directly allowed`,
							);
						}
					}
				});
			});
		}
	});
}

describe("defaultFieldKinds", () => {
	validateFieldKindSet(defaultSchemaPolicy);
});
