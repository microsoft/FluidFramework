/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from "@fluid-example/example-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import type { IValueChanged } from "@fluidframework/map/legacy";
import { type FC, useEffect, useState } from "react";
const diceValueKey = "diceValue";

/**
 * IDiceRoller describes the public API surface for our dice roller Fluid object.
 */
export interface IDiceRoller extends EventEmitter {
	/**
	 * Get the dice value as a number.
	 */
	readonly value: number;

	/**
	 * Roll the dice.  Will cause a "diceRolled" event to be emitted.
	 */
	roll: () => void;

	/**
	 * The diceRolled event will fire whenever someone rolls the dice, either locally or remotely.
	 */
	on(event: "diceRolled", listener: () => void): this;
}

export interface IDiceRollerViewProps {
	diceRoller: IDiceRoller;
}

export const DiceRollerView: FC<IDiceRollerViewProps> = ({
	diceRoller,
}: IDiceRollerViewProps) => {
	const [diceValue, setDiceValue] = useState(diceRoller.value);

	useEffect(() => {
		const onDiceRolled = (): void => {
			setDiceValue(diceRoller.value);
		};
		diceRoller.on("diceRolled", onDiceRolled);
		return (): void => {
			diceRoller.off("diceRolled", onDiceRolled);
		};
	}, [diceRoller]);

	// Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
	const diceChar = String.fromCodePoint(0x267f + diceValue);
	const color = `hsl(${diceValue * 60}, 70%, 50%)`;

	return (
		<div style={{ textAlign: "center" }}>
			<div style={{ fontSize: "200px", color }}>{diceChar}</div>
			<button style={{ fontSize: "50px" }} onClick={diceRoller.roll}>
				Roll
			</button>
		</div>
	);
};

/**
 * The DiceRoller is our implementation of the IDiceRoller interface.
 * @internal
 */
class DiceRoller extends DataObject implements IDiceRoller {
	public static readonly Name = "@fluid-example/dice-roller";

	public static readonly factory = new DataObjectFactory({
		type: DiceRoller.Name,
		ctor: DiceRoller,
	});

	/**
	 * initializingFirstTime is called only once, it is executed only by the first client to open the
	 * Fluid object and all work will resolve before the view is presented to any user.
	 *
	 * This method is used to perform Fluid object setup, which can include setting an initial schema or initial values.
	 */
	protected async initializingFirstTime(): Promise<void> {
		this.root.set(diceValueKey, 1);
	}

	protected async hasInitialized(): Promise<void> {
		this.root.on("valueChanged", (changed: IValueChanged) => {
			if (changed.key === diceValueKey) {
				this.emit("diceRolled");
			}
		});
	}

	public get value(): number {
		const value = this.root.get<number>(diceValueKey);
		if (value === undefined) {
			throw new Error("Expected dice value");
		}
		return value;
	}

	public readonly roll = (): void => {
		const rollValue = Math.floor(Math.random() * 6) + 1;
		this.root.set(diceValueKey, rollValue);
	};
}

/**
 * The DataObjectFactory declares the Fluid object and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 * @internal
 */
export const DiceRollerInstantiationFactory = DiceRoller.factory;
