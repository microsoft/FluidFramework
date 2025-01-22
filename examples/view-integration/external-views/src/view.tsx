/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { type FC, useEffect, useState } from "react";

import { IDiceRoller } from "./interface.js";

export interface IDiceRollerViewProps {
	diceRoller: IDiceRoller;
}

export const DiceRollerView: FC<IDiceRollerViewProps> = ({
	diceRoller,
}: IDiceRollerViewProps) => {
	const [diceValue, setDiceValue] = useState(diceRoller.value);

	useEffect(() => {
		const onDiceRolled = () => {
			setDiceValue(diceRoller.value);
		};
		diceRoller.events.on("diceRolled", onDiceRolled);
		return () => {
			diceRoller.events.off("diceRolled", onDiceRolled);
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
