/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  PrimedComponent,
  PrimedComponentFactory,
  SimpleModuleInstantiationFactory,
} from "@prague/aqueduct";
import {
  IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import {
  Counter,
  CounterValueType,
} from "@microsoft/fluid-map";

import * as React from "react";
import * as ReactDOM from "react-dom";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
export const ClickerName = pkg.name as string;

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLVisual {

  public get IComponentHTMLVisual() { return this; }

  /**
   * Do setup work here
   */
  protected async componentInitializingFirstTime() {
    this.root.set("clicks", 0, CounterValueType.Name);
  }

  // #region IComponentHTMLVisual

  /**
   * Will return a new Clicker view
   */
  public render(div: HTMLElement) {
    // Get our counter object that we set in initialize and pass it in to the view.
    const counter = this.root.get("clicks");
    ReactDOM.render(
      <CounterReactView counter={counter} />,
      div,
    );
    return div;
  }

  // #endregion IComponentHTMLVisual
}

// ----- REACT STUFF -----

interface p {
  counter: Counter;
}

interface s {
  value: number;
}

class CounterReactView extends React.Component<p, s> {
  constructor(props: p) {
    super(props);

    this.state = {
      value: this.props.counter.value,
    };
  }

  componentDidMount() {
    this.props.counter.on("incremented", (incrementValue: number, currentValue: number) => {
      this.setState({ value: currentValue });
    });
  }

  render() {
    return (
      <div>
        <span>{this.state.value}</span><button onClick={() => { this.props.counter.increment(1); }}>+</button>
      </div>
    );
  }
}

// ----- COMPONENT SETUP STUFF -----

export const ClickerInstantiationFactory = new PrimedComponentFactory(
  Clicker,
  [],
);

export const fluidExport = new SimpleModuleInstantiationFactory(
  ClickerName,
  new Map([
    [ClickerName, Promise.resolve(ClickerInstantiationFactory)],
  ]),
);
