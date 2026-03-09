/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventEmitter } from "@fluid-example/example-utils";
import globalJsdom from "global-jsdom";

import type { IDiceRoller } from "../interface.js";
import { renderDiceRoller } from "../view.js";

class MockDiceRoller extends EventEmitter implements IDiceRoller {
	public value: number = 1;
	public readonly roll = (): void => {
		this.value = Math.floor(Math.random() * 6) + 1;
		this.emit("diceRolled");
	};
	public hasTask(): boolean {
		return false;
	}
}

describe("task-selection", () => {
	let cleanup: () => void;

	before(() => {
		cleanup = globalJsdom();
	});

	after(() => {
		cleanup();
	});

	it("renders Roll button", () => {
		const div = document.createElement("div");
		const mockDiceRoller = new MockDiceRoller();
		renderDiceRoller(mockDiceRoller, div);

		const buttons = div.querySelectorAll("button");
		const rollButton = [...buttons].find((btn) => btn.textContent === "Roll");
		assert.ok(rollButton, "Expected a Roll button to be rendered");
	});

	it("renders dice character for initial value", () => {
		const div = document.createElement("div");
		const mockDiceRoller = new MockDiceRoller();
		mockDiceRoller.value = 3;
		renderDiceRoller(mockDiceRoller, div);

		// Unicode 0x2682 is ⚂ (die face 3), since 0x267F+3=0x2682
		assert.ok(div.textContent?.includes("⚂") === true, "Expected dice face ⚂ for value 3");
	});

	it("shows task ownership status", () => {
		const div = document.createElement("div");
		const mockDiceRoller = new MockDiceRoller();
		renderDiceRoller(mockDiceRoller, div);

		assert.ok(
			div.textContent?.includes("Not task owner") === true,
			"Expected 'Not task owner' when hasTask() is false",
		);
	});
});
