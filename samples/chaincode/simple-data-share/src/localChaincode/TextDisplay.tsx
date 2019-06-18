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
 * The TextDisplay does not directly manage or modify content. 
 * It simply takes in a counter, subscribes and displays changes to that counter.
 */
export class TextDisplay extends Component {

  public static readonly chaincodeName = chaincodeName + "/textDisplay";

  protected async create() {
    // create is not needed because we are using the state provided from out parent component
  }

  protected async render(host: HTMLDivElement) {
    // Query against whoever is hosting us for a counter. This will be the reference we use to display the count.
    // This will be the same counter provided in the services.
    const maybeCounter = await this.platform.queryInterface<Counter>("counter");
    if (maybeCounter) {
      ReactDOM.render(
        <TextDisplayView counter={maybeCounter} />,
        host
      );
    } else {
      alert("No counter provided to the TextDisplay");
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

interface s {
  value: number
}

/**
 * A React Component that displays the value of the counter
 * This also subscribes to changes on the value so it can update its state
 */
class TextDisplayView extends React.Component<p, s> {
  constructor(props: p) {
    super(props);

    this.state = {
      value: this.props.counter.value
    }
  }
  componentDidMount() {
    // Set a listener that triggers a re-render when the value is incremented
    this.props.counter.onIncrement = () => {
      this.setState({ value: this.props.counter.value })
    }

  }

  render() {
    return <span>{this.state.value}</span>;
  }
}
