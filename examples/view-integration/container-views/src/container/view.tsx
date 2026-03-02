/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { type FC, useEffect, useState } from "react";

import type { IDiceRoller } from "./diceRoller/index.js";

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
		diceRoller.events.on("diceRolled", onDiceRolled);
		return (): void => {
			diceRoller.events.off("diceRolled", onDiceRolled);
		};
	}, [diceRoller]);

	// Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
	const diceChar = String.fromCodePoint(0x267f + diceValue);

	return (
		<div>
			<span style={{ fontSize: 50 }}>{diceChar}</span>
			<button onClick={diceRoller.roll}>Roll</button>
		</div>
	);
};
