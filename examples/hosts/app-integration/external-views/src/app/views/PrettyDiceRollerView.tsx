/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { IDiceRoller } from "../../component";

interface IPrettyDiceRollerViewProps {
    model: IDiceRoller;
}

export const PrettyDiceRollerView: React.FC<IPrettyDiceRollerViewProps> =
    (props: React.PropsWithChildren<IPrettyDiceRollerViewProps>) => {
        const [diceValue, setDiceValue] = React.useState(props.model.value);

        React.useEffect(() => {
            const onDiceRolled = () => {
                setDiceValue(props.model.value);
            };
            props.model.on("diceRolled", onDiceRolled);
            return () => {
                props.model.off("diceRolled", onDiceRolled);
            };
        }, [props.model]);

        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        const diceChar = String.fromCodePoint(0x267F + diceValue);
        const diceColor = `hsl(${diceValue * 60}, 70%, 50%)`;

        return (
            <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 200, color: diceColor }}>{diceChar}</div>
                <button style={{ fontSize: 50 }} onClick={props.model.roll}>Roll</button>
            </div>
        );
    };
