import { fluidReactComponentFactory } from "./factory";

import React from "react";
import { useFluidReducer, useFluidState } from "./useFluidMap";

export function HelloWorld() {
    const [value, setValue] = useFluidState("hw-key", "hello");
    const handleClick = () => setValue(value === "hello" ? "world" : "hello");
    return <button onClick={handleClick}>{value}</button>;
}

export function DiceRoller() {
    const [value, setValue] = useFluidState("dice-key", 1);
    const getDiceChar = (): string => {
        return String.fromCodePoint(0x267F + value)
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

const initialState = { counter: 0 };

function reducer(state: { counter: number }, action: { type: string }) {
    switch (action.type) {
        case 'increment':
            return { counter: state.counter + 1 };
        case 'decrement':
            return { counter: state.counter - 1 };
        default:
            throw new Error();
    }
}

export function Counter(props: { id: string }) {
    const [state, dispatch] = useFluidReducer(props.id, reducer, initialState);
    return (
        <>
            Count: {state.counter}
            <button onClick={() => dispatch({ type: 'decrement' })}>-</button>
            <button onClick={() => dispatch({ type: 'increment' })}>+</button>
        </>
    );
}

/**
 * fluidExport is the entry point of the fluid package. We define our component
 * as a component that can be created in the container.
 */
export const fluidExport = fluidReactComponentFactory(
    "pretty-cool-example",
    <div>
        <HelloWorld />
        <DiceRoller />
        <Counter id={"counter1-key"} />
        <Counter id={"counter2-key"} />
    </div>);
