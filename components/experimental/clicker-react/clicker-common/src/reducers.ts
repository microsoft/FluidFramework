/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClickerReducer } from "@fluid-example/clicker-definitions";

export const ClickerReducer: IClickerReducer = {
    increment: {
        function: (state) => {
            if (state === undefined || state.fluidState?.counter === undefined) {
                throw Error("State was not initialized prior to dispatch call");
            }
            const counter = state.fluidState?.counter;
            counter.increment(1);
            state.viewState.value = counter.value;
            return { state };
        },
    },
    incrementTwo: {
        function: (state) => {
            if (state === undefined) {
                throw Error("State was not initialized prior to dispatch call");
            }
            ClickerReducer.increment.function(state);
            ClickerReducer.increment.function(state);
            return { state };
        },
    },
};
