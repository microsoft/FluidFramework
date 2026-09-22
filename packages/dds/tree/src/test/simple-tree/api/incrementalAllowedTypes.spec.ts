/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactoryAlpha,
	SchemaFactoryBeta,
	TreeViewConfigurationAlpha,
	type ValidateRecursiveSchema,
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type TreeNodeFromImplicitAllowedTypes,
} from "../../../simple-tree/index.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";

describe("incremental allowed types", () => {
	const sf = new SchemaFactoryBeta("incrementalAllowedTypes");

	it("preserves singleton and union types", () => {
		const singleton = sf.incrementalSummary(sf.string);
		type SingletonRead = TreeNodeFromImplicitAllowedTypes<typeof singleton>;
		type SingletonInsert = InsertableTreeNodeFromImplicitAllowedTypes<typeof singleton>;
		type _checkSingletonRead = requireTrue<areSafelyAssignable<SingletonRead, string>>;
		type _checkSingletonInsert = requireTrue<areSafelyAssignable<SingletonInsert, string>>;

		const union = SchemaFactoryBeta.incrementalSummary([sf.string, sf.number]);
		type UnionRead = TreeNodeFromImplicitAllowedTypes<typeof union>;
		type UnionInsert = InsertableTreeNodeFromImplicitAllowedTypes<typeof union>;
		type _checkUnionRead = requireTrue<areSafelyAssignable<UnionRead, string | number>>;
		type _checkUnionInsert = requireTrue<areSafelyAssignable<UnionInsert, string | number>>;

		assert.deepEqual([...singleton], [sf.string]);
		assert.deepEqual([...union], [sf.string, sf.number]);
	});

	it("attaches metadata recognized by the incremental encoding policy", () => {
		const singleton = sf.incrementalSummary(sf.string);
		const union = sf.incrementalSummary([sf.string, sf.number]);

		assert.equal(
			(singleton.metadata.custom as Record<symbol, unknown>)[incrementalSummaryHint],
			true,
		);
		assert.equal(
			(union.metadata.custom as Record<symbol, unknown>)[incrementalSummaryHint],
			true,
		);

		class Root extends sf.object("Root", {
			singleton,
			union,
		}) {}

		const policy = incrementalEncodingPolicyForAllowedTypes(
			new TreeViewConfigurationAlpha({ schema: Root }),
		);
		assert.equal(policy(Root.identifier, "singleton"), true);
		assert.equal(policy(Root.identifier, "union"), true);
	});

	it("supports recursive schemas", () => {
		class Recursive extends sf.arrayRecursive(
			"Recursive",
			sf.incrementalSummaryRecursive([() => Recursive]),
		) {}
		type _check = ValidateRecursiveSchema<typeof Recursive>;

		const allowedTypes = Recursive.info;
		assert.equal(
			(allowedTypes.metadata.custom as Record<symbol, unknown>)[incrementalSummaryHint],
			true,
		);

		const policy = incrementalEncodingPolicyForAllowedTypes(
			new TreeViewConfigurationAlpha({ schema: Recursive }),
		);
		assert.equal(policy(Recursive.identifier), true);
	});

	it("is inherited by SchemaFactoryAlpha", () => {
		const alpha = new SchemaFactoryAlpha("incrementalAllowedTypesAlpha");
		assert.deepEqual([...alpha.incrementalSummary(alpha.string)], [alpha.string]);
		assert.deepEqual(
			[...SchemaFactoryAlpha.incrementalSummary([alpha.string, alpha.number])],
			[alpha.string, alpha.number],
		);
	});
});
