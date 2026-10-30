/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mock } from "node:test";

import * as Type from "typebox/type";
import { Build, BuildResult } from "typebox/schema";

import { extractJsonValidator } from "../../codec/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";

describe("TypeBox validator compilation", () => {
	it("generates stable code across repeated compilations", () => {
		const schema = Type.Object(
			{
				items: Type.Array(Type.Object({ value: Type.Optional(Type.String()) })),
			},
			{ additionalProperties: false },
		);
		const first = Build(schema).Evaluate();
		Build(Type.Tuple([Type.Number(), Type.Boolean()])).Evaluate();
		const second = Build(schema).Evaluate();

		assert.equal(first.Code(), second.Code());
		for (const compiled of [first, second]) {
			assert.equal(compiled.Check({ items: [{}, { value: "text" }] }), true);
			assert.equal(compiled.Check({ items: [{ value: 1 }] }), false);
			assert.equal(compiled.Check({ items: [], extra: true }), false);
		}
	});

	it("keeps refinement bindings independent across compilations", () => {
		const positive = Build(Type.Refine(Type.Number(), (value) => value > 0)).Evaluate();
		const negative = Build(Type.Refine(Type.Number(), (value) => value < 0)).Evaluate();

		assert.equal(positive.Check(1), true);
		assert.equal(positive.Check(-1), false);
		assert.equal(negative.Check(-1), true);
		assert.equal(negative.Check(1), false);
	});

	it("compiles a shared schema once and preserves validation", () => {
		const compile = mock.method(BuildResult.prototype, "Evaluate");
		try {
			const schema = Type.Object({ count: Type.Integer({ minimum: 0 }) });
			const validator = extractJsonValidator(FormatValidatorBasic);
			const first = validator.compile(schema);
			const second = validator.compile(schema);
			assert.equal(compile.mock.callCount(), 1);
			for (const compiled of [first, second]) {
				assert.equal(compiled.check({ count: 1 }), true);
				assert.equal(compiled.check({ count: -1 }), false);
				assert.equal(compiled.check({ count: 0.5 }), false);
				assert.equal(compiled.check({}), false);
			}
			assert.equal(compile.mock.callCount(), 1);
		} finally {
			compile.mock.restore();
		}
	});

	it("compiles distinct schema identities independently", () => {
		const compile = mock.method(BuildResult.prototype, "Evaluate");
		try {
			const validator = extractJsonValidator(FormatValidatorBasic);
			validator.compile(Type.Number());
			validator.compile(Type.Number());
			assert.equal(compile.mock.callCount(), 2);
			const string = validator.compile(Type.String());
			assert.equal(string.check("value"), true);
			assert.equal(string.check(1), false);
			assert.equal(compile.mock.callCount(), 3);
		} finally {
			compile.mock.restore();
		}
	});

	it("propagates compilation errors without caching failures", () => {
		const failure = new Error("Validator evaluation failed.");
		const compile = mock.method(BuildResult.prototype, "Evaluate", () => {
			throw failure;
		});
		try {
			const validator = extractJsonValidator(FormatValidatorBasic);
			const schema = Type.Number();
			assert.throws(
				() => validator.compile(schema),
				(error: unknown) => error === failure,
			);
			assert.throws(
				() => validator.compile(schema),
				(error: unknown) => error === failure,
			);
			assert.equal(compile.mock.callCount(), 2);
		} finally {
			compile.mock.restore();
		}
	});
});
