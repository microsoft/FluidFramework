/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { useFluidState } from "@fluidframework/tiny-react";

/**
 * An example that uses useFluidState to build our simple DiceRoller
 */
export function DiceRoller() {
    const [value, setValue] = useFluidState("dice-key", 1);
    const getDiceChar = (): string => {
        return String.fromCodePoint(0x267F + value);
    };
    const roll = () => {
        setValue(Math.floor(Math.random() * 6) + 1);
    };
    return (
        <div>
            <span style={{ fontSize: 50 }}>{getDiceChar()}</span>
            <button onClick={roll}>Roll</button>
        </div>
    );
}
