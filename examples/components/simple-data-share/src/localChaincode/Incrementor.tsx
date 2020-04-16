/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { Counter } from "@microsoft/fluid-map";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
const chaincodeName = pkg.name;

/**
 * Not all components need to have ui.
 * Incrementor is a component that does not have any UI and simply modifies content in the background.
 * Incrementor set's a timer that increments a random value between 1-10 every 5 seconds.
 * You could imagine that a component like this could make background calls to populate data.
 * This logic is valuable as a component when you could imagining using it with multiple other components.
 */
export class Incrementor extends PrimedComponent {
    public static readonly chaincodeName = `${chaincodeName}/incrementor`;
    public counter: Counter | undefined;

    protected async componentInitializingFirstTime() {
        this.setupTimer();
    }

    private setupTimer() {
        // Random number between 1-10
        const incrementCallback = () => {
            const randomNumber = Math.floor((Math.random() * 10) + 1);
            // This.counter should be set by the root component. If it isn't defined yet, just return
            if (this.counter) {
                this.counter.increment(randomNumber);
            } else {
                console.log("counter undefined; skipping this increment");
            }
        };

        // Set a timer to call the above callback every 5 seconds
        setInterval(incrementCallback, 5000);
    }
}

export const IncrementorInstantiationFactory = new PrimedComponentFactory(
    chaincodeName,
    Incrementor,
    [],
    {},
);
