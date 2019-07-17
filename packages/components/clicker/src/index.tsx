/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  PrimedComponent,
  SimpleComponentInstantiationFactory,
  SimpleModuleInstantiationFactory,
} from "@prague/aqueduct";
import {
  IComponentHTMLVisual,
  IContainerContext,
  IRuntime,
} from "@prague/container-definitions";
import {
  Counter,
  CounterValueType,
  SharedMap,
} from "@prague/map";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";

import * as React from "react";
import * as ReactDOM from "react-dom";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
export const ClickerName = pkg.name as string;

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLVisual {
  private static readonly supportedInterfaces = ["IComponentHTMLVisual", "IComponentHTMLRender",
  "IComponentRouter"];

  /**
   * Do setup work here
   */
  protected async create() {
    // This allows the PrimedComponent to create the root map
    await super.create();
    this.root.set("clicks", 0, CounterValueType.Name);
  }

  /**
   * Static load function that allows us to make async calls while creating our object.
   * This becomes the standard practice for creating components in the new world.
   * Using a static allows us to have async calls in class creation that you can't have in a constructor
   */
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<Clicker> {
    const clicker = new Clicker(runtime, context, Clicker.supportedInterfaces);
    await clicker.initialize();

    return clicker;
  }

  // start IComponentHTMLVisual

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

  // end IComponentHTMLVisual
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
export const ClickerInstantiationFactory = new SimpleComponentInstantiationFactory(
  [
    SharedMap.getFactory([new CounterValueType()]),
  ],
  Clicker.load,
);

export const fluidExport = new SimpleModuleInstantiationFactory(
  ClickerName,
  new Map([
    [ClickerName, Promise.resolve(ClickerInstantiationFactory)],
  ]),
);

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return fluidExport.instantiateRuntime(context);
}

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
  return fluidExport.instantiateComponent(context);
}
