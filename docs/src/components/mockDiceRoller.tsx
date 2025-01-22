/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { CardWithBlur } from "@site/src/components/card";

type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

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

	const rollDice = (): void => {
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
	diceValue: DiceValue;

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
	const imageUrl = `https://storage.fluidframework.com/static/images/website/dice/${diceValue}.png`;
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
					aria-live="polite"
				/>
				<button className="ffcom-roll-button" onClick={onClick}>
					<span className="ffcom-roll-button-label">Roll</span>
				</button>
			</div>
		</CardWithBlur>
	);
}
