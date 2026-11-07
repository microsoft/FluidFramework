/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mock } from "node:test";

import * as Type from "@sinclair/typebox";
// eslint-disable-next-line import-x/no-internal-modules -- TypeBox documents this compiler entrypoint.
import { TypeCompiler, TypeCompilerUnknownTypeError } from "@sinclair/typebox/compiler";

import { extractJsonValidator } from "../../codec/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";

describe("TypeBox validator compilation cache", () => {
	it("compiles a shared schema once and preserves validation", () => {
		const compile = mock.method(TypeCompiler, "Compile");
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
		const compile = mock.method(TypeCompiler, "Compile");
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
		const compile = mock.method(TypeCompiler, "Compile");
		try {
			const validator = extractJsonValidator(FormatValidatorBasic);
			const schema = Type.Unsafe({ type: "invalid" });
			assert.throws(() => validator.compile(schema), TypeCompilerUnknownTypeError);
			assert.throws(() => validator.compile(schema), TypeCompilerUnknownTypeError);
			assert.equal(compile.mock.callCount(), 2);
		} finally {
			compile.mock.restore();
		}
	});
});
