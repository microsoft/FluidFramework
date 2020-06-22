/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { PrimedContext } from "./context";

export function View() {
    const { state, dispatch } = React.useContext(PrimedContext);
    if (state === undefined || dispatch === undefined) {
        throw Error("Context was not initialized.");
    }
    return (
        <div>
            <span className="value">
                {state.value}
            </span>
            <button onClick={() => dispatch.increment.function()}>
                +
            </button>
            <button onClick={() => dispatch.incrementTwo.function()}>
                ++
            </button>
        </div>
    );
}
