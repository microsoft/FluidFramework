/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { useFluidReducer } from "@fluidframework/tiny-react";

const initialState = { counter: 0 };

function reducer(state: { counter: number }, action: { type: string }) {
    switch (action.type) {
        case "increment":
            return { counter: state.counter + 1 };
        case "decrement":
            return { counter: state.counter - 1 };
        default:
            throw new Error();
    }
}

/**
 * An example that uses useFluidReducer to modify the fluid map entry
 */
export function Counter(props: { id: string }) {
    const [state, dispatch] = useFluidReducer(props.id, reducer, initialState);
    return (
        <>
            Count: {state.counter}
            <button onClick={() => dispatch({ type: "decrement" })}>-</button>
            <button onClick={() => dispatch({ type: "increment" })}>+</button>
        </>
    );
}
