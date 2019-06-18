/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component } from "@prague/app-component";
import { Counter } from "@prague/map";
import * as React from "react";
import * as ReactDOM from "react-dom";

const pkg = require("../../package.json");
const chaincodeName = pkg.name;

/**
 * Button does not display any content but modifies the counter count on the button click.
 */
export class Button extends Component {

  public static readonly chaincodeName = chaincodeName + "/button";

  protected async create() {
    // create is not needed because we are using the state provided from our parent component
  }

  protected async render(host: HTMLDivElement) {
    // Query against whoever is hosting us for a counter. This will be the reference we use to increment.
    // This will be the same counter provided in the services.
    const maybeCounter = await this.platform.queryInterface<Counter>("counter");
    if (maybeCounter) {
      ReactDOM.render(
        <ButtonView counter={maybeCounter} />,
        host
      );
    } else {
      alert("No counter provided to the Button");
      return;
    }
  }

  /**
   *  The component has been loaded. Render the component into the provided div
   */
  public async opened() {
    // This is querying for a div from the component not the container
    // This will be the div that we provided in the services
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (maybeDiv) {
      await this.render(maybeDiv);
    } else {
      return;
    }
  }
}

interface p {
  counter: Counter
}

/**
 * A React button function that increments the counter on click
 */
function ButtonView(props: p) {
  const increment = () => props.counter.increment(1);
  return <button onClick={increment}>+</button>;
}