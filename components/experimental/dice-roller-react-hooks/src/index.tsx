/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidReactComponentFactory } from "./factory";

import React from "react";
import { useFluidMap } from "./useFluidMap";

/**
 * HelloWorld clicker example using the useFluidMap hook.
 * Yes, it's a bad example of a clicker.
 * No, it doesn't use the clicker DDS.
 * Yes, we could support other DDSs. Maybe... I haven't thought too much but I don't see why not.
 */
export function HelloWorld() {
    const [value, setValue] = useFluidMap("hello", 1);
    return <button onClick={() => setValue(value + 1)}>{value}</button>;
}

/**
 * DiceRoller example using the useFluidMap hook
 */
export function DiceRoller() {
    const [value, setValue] = useFluidMap("dice-key", 1);
    const getDiceChar = (): string => {
        return String.fromCodePoint(0x267F + value)
    };
    const roll = () => {
        setValue(Math.floor(Math.random() * 6) + 1);
    };
    return (
        <>
            <HelloWorld />
            <div>
                <span style={{ fontSize: 50 }}>{getDiceChar()}</span>
                <button onClick={roll}>Roll</button>
            </div>
        </>
    );
}

/**
 * fluidExport is the entry point of the fluid package. We define our component
 * as a component that can be created in the container.
 */
export const fluidExport = fluidReactComponentFactory("pretty-cool-example", <DiceRoller />);
