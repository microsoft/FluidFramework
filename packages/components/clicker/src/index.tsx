/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RootComponent, StockContainerRuntimeFactory } from "@prague/aqueduct";
import { ComponentRuntime } from "@prague/component-runtime";
import {
  IContainerContext,
  IRuntime,
  IComponentHTMLViewable,
  IRequest,
  IHTMLView,
  IComponent,
} from "@prague/container-definitions";
import {
  DistributedSetValueType,
  MapExtension,
  registerDefaultValueType,
  ISharedMap,
  CounterValueType,
  Counter,
} from "@prague/map";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";

import * as React from "react";
import * as ReactDOM from "react-dom";

const pkg = require("../package.json");
export const ClickerName = pkg.name;

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends RootComponent implements IComponentHTMLViewable {
  private static SupportedInterfaces = ["IComponentHTMLViewable", "IComponentRouter"];

  /**
   * Do setup work here
   */
  protected async created() {
    // This allows the RootComponent to do setup. In this case it creates the root map
    await super.created();
    this.root.set("clicks", 0, CounterValueType.Name);
  }

  /**
   * Static load function that allows us to make async calls while creating our object.
   * This becomes the standard practice for creating components in the new world.
   * Using a static allows us to have async calls in class creation that you can't have in a constructor
   */
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<Clicker> {
    const clicker = new Clicker(runtime, context, Clicker.SupportedInterfaces);
    await clicker.initialize();

    return clicker;
  }

  // start IComponentHTMLViewable

  /**
   * Will return a new Clicker view
   */
  public async addView(host: IComponent): Promise<IHTMLView> {
    // Get our counter object that we set in initialize and pass it in to the view.
    const counter = this.root.get("clicks");

    const div = document.createElement("div");
    ReactDOM.render(
      <CounterReactView map={this.root} counter={counter} />,
      div
    );

    return div;
  }

  // end IComponentHTMLViewable
}

// ----- REACT STUFF -----

interface p {
  map: ISharedMap,
  counter: Counter,
}

interface s {
  value: number;
}

class CounterReactView extends React.Component<p, s> {
  constructor(props: p) {
    super(props);

    this.state = {
      value: this.props.counter.value
    }
  }

  componentDidMount() {
    // set a listener so when the counter increments we will update our state
    // counter is annoying because it only allows you to register one listener.
    // this causes problems when we have multiple views off the same counter.
    // so we are listening to the map
    this.props.map.on("valueChanged", () => {
      this.setState({ value: this.props.counter.value });
    });
  }

  render() {
    return (
      <div>
        <span>{this.state.value}</span><button onClick={() => { this.props.counter.increment(1) }}>+</button>
      </div>
    );
  }
}

// ----- COMPONENT SETUP STUFF -----

/**
 * This is where we do component setup.
 */
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
  // Register default map value types (Register the DDS we care about)
  // We need to register the Map and the Counter so we can create a root and a counter on that root
  registerDefaultValueType(new DistributedSetValueType());
  registerDefaultValueType(new CounterValueType());

  const dataTypes = new Map<string, ISharedObjectExtension>();
  dataTypes.set(MapExtension.Type, new MapExtension());

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
export async function instantiateRuntime(
  context: IContainerContext
): Promise<IRuntime> {
  return StockContainerRuntimeFactory.instantiateRuntime(context, ClickerName, new Map([
    [ClickerName, Promise.resolve({ instantiateComponent })]
  ]));
}
