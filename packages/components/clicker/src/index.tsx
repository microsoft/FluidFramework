/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RootComponent, SimpleContainerRuntimeFactory } from "@prague/aqueduct";
import { ComponentRuntime } from "@prague/component-runtime";
import {
  IComponentHTMLVisual,
  IContainerContext,
  IRequest,
  IRuntime,
  IRuntimeFactory,
} from "@prague/container-definitions";
import {
  Counter,
  CounterValueType,
  DistributedSetValueType,
  SharedMap,
} from "@prague/map";
import {
  IComponentContext,
  IComponentFactory,
  IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";

import * as React from "react";
import * as ReactDOM from "react-dom";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
export const ClickerName = pkg.name as string;

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends RootComponent implements IComponentHTMLVisual {
  private static readonly supportedInterfaces = ["IComponentHTMLVisual", "IComponentHTMLRender",
  "IComponentRouter"];

  /**
   * Do setup work here
   */
  protected async create() {
    // This allows the RootComponent to do setup. In this case it creates the root map
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

export class ClickerFactoryComponent implements IComponentFactory, IRuntimeFactory {
  public static supportedInterfaces = ["IComponentFactory", "IRuntimeFactory"];

  public query(id: string): any {
    return ClickerFactoryComponent.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
  }

  public list(): string[] {
      return ClickerFactoryComponent.supportedInterfaces;
  }

  /**
   * This is where we do component setup.
   */
  public async instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    // Register default map value types (Register the DDS we care about)
    // We need to register the Map and the Counter so we can create a root and a counter on that root
    const mapValueTypes = [
      new DistributedSetValueType(),
      new CounterValueType(),
    ];

    const dataTypes = new Map<string, ISharedObjectExtension>();
    const mapExtension = SharedMap.getFactory(mapValueTypes);
    dataTypes.set(mapExtension.type, mapExtension);

    // Create a new runtime for our component
    const runtime = await ComponentRuntime.load(context, dataTypes);

    // Create a new instance of our component
    const counterNewP = Clicker.load(runtime, context);

    // Add a handler for the request() on our runtime to send it to our component
    // This will define how requests to the runtime object we just created gets handled
    // Here we want to simply defer those requests to our component
    runtime.registerRequestHandler(async (request: IRequest) => {
      const counter = await counterNewP;
      return counter.request(request);
    });

    return runtime;
  }

  // ----- CONTAINER STUFF -----

  /**
   * This will get called by the Container as part of setup
   * We provide all the components we will care about as a registry.
   */
  public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return SimpleContainerRuntimeFactory.instantiateRuntime(context, ClickerName, new Map([
      [ClickerName, Promise.resolve(this)],
    ]));
  }
}

export const fluidExport = new ClickerFactoryComponent();

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return fluidExport.instantiateRuntime(context);
}

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
  return fluidExport.instantiateComponent(context);
}
