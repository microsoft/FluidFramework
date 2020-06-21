/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClickerReducer } from "@fluid-example/clicker-definitions";

export const ClickerReducer: IClickerReducer = {
    increment: {
        function: (state, step: number) => {
            const counter = state.fluidState?.counter;
            if (counter === undefined) {
                throw Error("Failed to increment, fluid state was not initalized");
            }
            counter.increment(step);
            state.viewState.value = counter.value;
            return { state };
        },
    },
};
