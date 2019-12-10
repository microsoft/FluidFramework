/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { Counter, CounterValueType } from "@microsoft/fluid-map";
import { ITask } from "@microsoft/fluid-runtime-definitions";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ClickerAgent } from "./agent";

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
    this.root.createValueType("clicks", CounterValueType.Name, 0);
    if (!this.runtime.connected) {
      // tslint:disable-next-line
      await new Promise<void>((resolve) => this.runtime.on("connected", () => resolve()));
    }
    this.setupAgent();
  }

  protected async componentInitializingFromExisting() {
    this.setupAgent();
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

  public setupAgent() {
    // tslint:disable no-console
    const counter: Counter = this.root.get("clicks");
    const agentTask: ITask = {
      id: "agent",
      instance: new ClickerAgent(counter),
    };
    this.taskManager.register(agentTask);
    this.taskManager.pick(this.url, "agent", true).then(() => {
      console.log(`Picked`);
    }, (err) => {
      console.log(err);
    });
  }

  // #endregion IComponentHTMLVisual
}

// ----- REACT STUFF -----

interface CounterProps {
  counter: Counter;
}

interface CounterState {
  value: number;
}

class CounterReactView extends React.Component<CounterProps, CounterState> {
  constructor(props: CounterProps) {
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
        <span className="clicker-value-class" id={`clicker-value-${Date.now().toString()}`}>{this.state.value}</span>
        <button onClick={() => { this.props.counter.increment(1); }}>+</button>
      </div>
    );
  }
}

// ----- FACTORY SETUP -----

export const ClickerInstantiationFactory = new PrimedComponentFactory(
  Clicker,
  [],
);

export const fluidExport = ClickerInstantiationFactory;
