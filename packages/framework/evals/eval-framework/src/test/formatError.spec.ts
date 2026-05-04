/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { formatError } from "../formatError.js";

describe("formatError", () => {
	it("returns the stack for a plain Error", () => {
		const err = new Error("something went wrong");
		const result = formatError(err);
		expect(result).toContain("something went wrong");
		expect(result).toContain("at "); // stack frames present
	});

	it('joins a two-level cause chain with "Caused by:"', () => {
		const root = new Error("root cause");
		const wrapper = new Error("outer error", { cause: root });
		const result = formatError(wrapper);
		expect(result).toContain("outer error");
		expect(result).toContain("Caused by: ");
		expect(result).toContain("root cause");
	});

	it("walks an arbitrarily deep cause chain", () => {
		const level1 = new Error("level 1");
		const level2 = new Error("level 2", { cause: level1 });
		const level3 = new Error("level 3", { cause: level2 });
		const result = formatError(level3);
		expect(result).toContain("level 3");
		expect(result).toContain("level 2");
		expect(result).toContain("level 1");
		expect(result.split("Caused by: ")).toHaveLength(3);
	});

	it("appends a non-Error cause at the end of the chain", () => {
		const err = new Error("wrapper", { cause: "raw string cause" });
		const result = formatError(err);
		expect(result).toContain("wrapper");
		expect(result).toContain("Caused by: ");
		expect(result).toContain("raw string cause");
	});

	it("handles a non-Error thrown value", () => {
		const result = formatError("just a string");
		expect(result).toBe("just a string");
	});

	it("handles null/undefined gracefully", () => {
		// eslint-disable-next-line unicorn/no-null -- intentionally testing null input handling
		expect(formatError(null as unknown)).toBe("");
		expect(formatError(undefined)).toBe("");
	});

	it("falls back to message when stack is undefined", () => {
		const err = new Error("no stack here");
		delete err.stack;
		const result = formatError(err);
		expect(result).toBe("no stack here");
	});
});
