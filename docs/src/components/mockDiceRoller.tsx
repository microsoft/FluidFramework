/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { CardWithBlur } from "@site/src/components/card";
import Dice1 from "@site/static/assets/dice/1.png";
import Dice2 from "@site/static/assets/dice/2.png";
import Dice3 from "@site/static/assets/dice/3.png";
import Dice4 from "@site/static/assets/dice/4.png";
import Dice5 from "@site/static/assets/dice/5.png";
import Dice6 from "@site/static/assets/dice/6.png";

const diceImages = new Map<number, string>([
	[1, Dice1],
	[2, Dice2],
	[3, Dice3],
	[4, Dice4],
	[5, Dice5],
	[6, Dice6],
]);

import "@site/src/css/mockDiceRoller.css";

/**
 * {@link MockDiceRollerSample} component props.
 */
export interface MockDiceRollerSampleProps {
	/**
	 * Style properties to apply to the root element of the component.
	 */
	style?: React.CSSProperties;

	/**
	 * Optional CSS class name to apply to the root element of the component.
	 */
	className?: string;
}

/**
 * Mock dice roller implementation for the website.
 *
 * @remarks
 * This is a temporary implementation until we have a way to embed live Fluid sample apps.
 * In the future, we should remove this and embed the dice roller app directly.
 */
export function MockDiceRollerSample({
	style,
	className,
}: MockDiceRollerSampleProps): React.ReactElement {
	const [containerId] = React.useState(Date.now().toString());
	const [diceValue, setDiceValue] = React.useState(1);

	const rollDice = () => {
		setDiceValue(Math.floor(Math.random() * 6) + 1);
	};

	return (
		<div style={style} className={className}>
			<DiceRollerCard diceValue={diceValue} containerId={containerId} onClick={rollDice} />
			<DiceRollerCard diceValue={diceValue} containerId={containerId} onClick={rollDice} />
		</div>
	);
}

/**
 * {@link DiceRollerCard} component props.
 */
interface DiceRollerCardProps {
	/**
	 * The current value of the dice.
	 */
	diceValue: number;

	/**
	 * The mock container ID, to display in the URL bar of the card.
	 */
	containerId: string;

	/**
	 * Invoked when the "Roll" button is clicked.
	 */
	onClick?: () => void;
}

/**
 * A single dice-roller view within a styled card.
 */
function DiceRollerCard({
	diceValue,
	containerId,
	onClick,
}: DiceRollerCardProps): React.ReactElement {
	const imageUrl = diceImages.get(diceValue)!;
	return (
		<CardWithBlur>
			<div className="ffcom-dice-roller-card ">
				<div className="ffcom-dice-roller-card-nav-bar">
					{`http://localhost:8080#${containerId}`}
				</div>
				<img
					className="ffcom-dice-image"
					src={imageUrl}
					alt={`Dice showing ${diceValue}`}
				/>
				<button className="ffcom-roll-button" onClick={onClick}>
					<span className="ffcom-roll-button-label">Roll</span>
				</button>
			</div>
		</CardWithBlur>
	);
}
