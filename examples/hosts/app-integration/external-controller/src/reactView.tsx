/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";
import { IKeyValueDataObject } from "./kvpair-dataobject";

/**
 * Render an IDiceRoller into a given div as a text character, with a button to roll it.
 * @param dataObject - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderDiceRoller(DO: IKeyValueDataObject, div: HTMLDivElement) {
    ReactDOM.render(<ReactView dataObject={DO} />, div);
}

interface IReactViewProps {
    dataObject: IKeyValueDataObject
}

const ReactView = (props: IReactViewProps) => {
    const { dataObject } = props;
    const [diceValue, setDiceValue] = React.useState(1);

    const diceCharacter = String.fromCodePoint(0x267F + diceValue);
    const rollDice = () => dataObject.set("dice", Math.floor(Math.random() * 6) + 1);
    const syncLocalAndFluidState = () => setDiceValue(dataObject.get("dice"));

    React.useEffect(() => {
        dataObject.on("changed", syncLocalAndFluidState);
        return () => {
            dataObject.off("changed", syncLocalAndFluidState);
        };
    });
    return (
        <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 200, color: `hsl(${diceValue * 60}, 70%, 50%)` }}>
                {diceCharacter}
            </div>
            <button style={{ fontSize: 50 }} onClick={rollDice}>
                Roll
            </button>
        </div>
    );
};
