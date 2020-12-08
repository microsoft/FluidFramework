import React from "react";
import { IKeyValueDataObject } from './dataObject'

interface IDiceRolerProps {
    data: IKeyValueDataObject
}

export const DiceRollerView: React.FC<IDiceRolerProps> = (props) => {
    const [value, setValue] = React.useState(1);
    const dataKey = 'dataKey';

    const handleChange = (args) => {
        if (args.key === dataKey) {
            setValue(props.data.get(dataKey))
        }
    };

    React.useEffect(() => {
        props.data.on("changed", handleChange);
        return () => { props.data.off("changed", handleChange) };
    }, [props.data]);

    // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
    const diceChar = String.fromCodePoint(0x267F + value);

    return (
        <div>
            <span style={{ fontSize: 50 }}>{diceChar}</span>
            <button onClick={() => props.data.set(dataKey, Math.floor(Math.random() * 6) + 1)}>Roll</button>
        </div>
    );
};
