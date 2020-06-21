/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { PrimedContext } from "./context";

export function View() {
    const { state, setState } = React.useContext(PrimedContext);
    if (state === undefined || setState === undefined) {
        throw Error("Context was not initialized.");
    }
    return (
        <div>
            <span>
                {state.value}
            </span>
            <button
                onClick={() => setState({ value: state.value + 1 })}
            >
                {"+"}
            </button>
        </div>
    );
}
