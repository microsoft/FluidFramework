/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { IDiceRoller } from "./interface.js";

interface IDiceRollerViewProps {
	model: IDiceRoller;
}

export const DiceRollerView: React.FC<IDiceRollerViewProps> = (
	props: IDiceRollerViewProps,
) => {
	const [diceValue, setDiceValue] = React.useState(props.model.value);

	React.useEffect(() => {
		// useEffect runs async after render, so it's possible for the dice value to update after render but
		// before we get our event listener registered.  We refresh our dice value in case that happened.
		setDiceValue(props.model.value);
		const onDiceRolled = () => {
			setDiceValue(props.model.value);
		};
		props.model.on("diceRolled", onDiceRolled);
		return () => {
			props.model.off("diceRolled", onDiceRolled);
		};
	}, [props.model]);

	// Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
	const diceChar = String.fromCodePoint(0x267f + diceValue);

	return (
		<div>
			<span style={{ fontSize: 50 }}>{diceChar}</span>
			<button onClick={props.model.roll}>Roll</button>
		</div>
	);
};
