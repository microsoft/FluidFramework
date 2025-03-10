/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { getRandomName, choose } from "../../generateNames";

describe("DockerNames", () => {
	describe("getRandomName", () => {
		it("generates a random name", async () => {
			const name = getRandomName();
			const names = name.split("_");
			assert(names.length === 2);
			assert(names[0].length >= 1);
			assert(names[1].length >= 1);
			assert(name.includes("_"));
		});

		it("generates a random name with '-' connector", async () => {
			const name = getRandomName("-");
			assert(name.includes("-"));
		});

		it("generates a random name with uppercase", async () => {
			const name = getRandomName("_", true);
			const [first, last] = name.split("_");
			const isUpperCase = (str) => {
				return str === str.toUpperCase();
			};
			assert(isUpperCase(first[0]));
			assert(isUpperCase(last[0]));
		});
	});
	describe("choose", () => {
		it("generates a random name", async () => {
			const name = choose();
			assert(typeof name === "string");
			assert(name.includes("_"));
		});
	});
});
