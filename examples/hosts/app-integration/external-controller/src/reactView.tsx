/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";
import { IDiceRollerController } from "./controller";

/**
 * Render Dice into a given HTMLElement as a text character, with a button to roll it.
 * @param dataObject - The Data Object to be rendered
 * @param div - The HTMLElement to render into
 */
export function renderDiceRoller(diceRoller: IDiceRollerController, div: HTMLDivElement) {
    ReactDOM.render(<ReactView diceRoller={diceRoller} />, div);
}

interface IReactViewProps {
    diceRoller: IDiceRollerController;
}

const ReactView = (props: IReactViewProps) => {
    const { diceRoller } = props;
    const [diceValue, setDiceValue] = React.useState(diceRoller.value);

    const diceCharacter = String.fromCodePoint(0x267F + diceValue);

    React.useEffect(() => {
        // useEffect runs async after render, so it's possible for the dice value to update after render but
        // before we get our event listener registered.  We refresh our dice value in case that happened.
        setDiceValue(diceRoller.value);
        const onDiceRolled = () => {
            setDiceValue(diceRoller.value);
        };
        diceRoller.on("diceRolled", onDiceRolled);
        return () => {
            diceRoller.off("diceRolled", onDiceRolled);
        };
    }, [diceRoller]);

    return (
        <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 200, color: `hsl(${diceValue * 60}, 70%, 50%)` }}>
                {diceCharacter}
            </div>
            <button style={{ fontSize: 50 }} onClick={diceRoller.roll}>
                Roll
            </button>
        </div>
    );
};
