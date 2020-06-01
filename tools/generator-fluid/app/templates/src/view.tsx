import * as React from "react";

import { IDiceRoller } from "./interface";

interface IDiceRollerViewProps {
    model: IDiceRoller;
}

export const DiceRollerView: React.FC<IDiceRollerViewProps> = (props: IDiceRollerViewProps) => {
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

    return (
        <div>
            <span style={{ fontSize: 50 }}>{diceChar}</span>
            <button onClick={props.model.roll}>Roll</button>
        </div>
    );
};