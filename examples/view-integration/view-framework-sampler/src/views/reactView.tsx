/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { IDiceRoller } from "../dataObject.js";

/**
 * Render Dice into a given HTMLElement as a text character, with a button to roll it.
 * @param diceRoller - The dice roller to be rendered
 * @param div - The HTMLElement to render into
 */
export function reactRenderDiceRoller(diceRoller: IDiceRoller, div: HTMLDivElement) {
	ReactDOM.render(<DiceRollerView model={diceRoller} />, div);
}

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
	const diceColor = `hsl(${diceValue * 60}, 70%, 50%)`;

	return (
		<div style={{ fontSize: 50, textAlign: "center" }}>
			<div>React</div>
			<div style={{ fontSize: 200, color: diceColor }}>{diceChar}</div>
			<button style={{ fontSize: 50 }} onClick={props.model.roll}>
				Roll
			</button>
		</div>
	);
};
