/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { Counter } from "@microsoft/fluid-map";

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
  public static readonly chaincodeName = chaincodeName + "/incrementor";
  public counter: Counter;

  public setupTimer() {

    // random number between 1-10
    const incrementCallback = () => {
      const randomNumber = Math.floor((Math.random() * 10) + 1);
      this.counter.increment(randomNumber);
    }

    // Set a timer to call the above callback every 5 seconds
    setInterval(incrementCallback, 5000);
  }

  /**
   *  The component has been loaded.
   */
  /*
  public async opened() {
    // We only need the counter in this example
    if (this.counter) {
      await this.setupTimer(this.counter);
    } else {
      alert("Incrementor needs a Counter")
      return;
    }
  }
  */
}

export const IncrementorInstantiationFactory = new PrimedComponentFactory(
  Incrementor,
  [],
);
