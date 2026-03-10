/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventEmitter } from "@fluid-example/example-utils";
import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";

import type { IDiceRoller } from "../container/main.js";
import { DiceRollerView } from "../container/main.js";

class MockDiceRoller extends EventEmitter implements IDiceRoller {
	public value: number = 1;
	public readonly roll = (): void => {
		this.value = Math.floor(Math.random() * 6) + 1;
		this.emit("diceRolled");
	};
}

describe("diceroller", () => {
	let cleanup: () => void;

	before(() => {
		cleanup = globalJsdom();
	});

	after(() => {
		cleanup();
	});

	it("renders Roll button", () => {
		const mockDiceRoller = new MockDiceRoller();
		const { baseElement } = render(<DiceRollerView diceRoller={mockDiceRoller} />);
		const buttons = baseElement.querySelectorAll("button");
		const hasRoll = [...buttons].some((btn) => btn.textContent === "Roll");
		assert.ok(hasRoll, "Expected Roll button to be present");
	});

	it("renders dice character for value 1", () => {
		const mockDiceRoller = new MockDiceRoller();
		mockDiceRoller.value = 1;
		const { baseElement } = render(<DiceRollerView diceRoller={mockDiceRoller} />);
		// Unicode 0x2680 is ⚀ (die face 1), since diceValue=1 → 0x267F+1=0x2680
		assert.ok(
			baseElement.textContent?.includes("⚀") === true,
			"Expected dice face ⚀ for value 1",
		);
	});
});
