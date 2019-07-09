/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RootComponent } from "@prague/aqueduct";
import { ComponentRuntime } from "@prague/component-runtime";
import {
    IComponent,
    IComponentHTMLViewable,
    IHTMLView,
    IRequest,
} from "@prague/container-definitions";
import {
    Counter,
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    SharedMap,
} from "@prague/map";
import {
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";

import * as React from "react";
import * as ReactDOM from "react-dom";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../package.json");
export const ClickerName = `${pkg.name as string}-clicker`;

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends RootComponent implements IComponentHTMLViewable {
    private static readonly supportedInterfaces = ["IComponentHTMLViewable", "IComponentRouter"];

    /**
     * Do setup work here
     */
    protected async create() {
        // This allows the RootComponent to do setup. In this case it creates the root map
        await super.create();
        this.root.set("clicks", 0, CounterValueType.Name);

        const clicks = this.root.get<Counter>("clicks");
        clicks.increment(5);

        // Create a second map on the root.
        this.root.set("secondMap", SharedMap.create(this.runtime));

        // Add another clicker to the second map
        const otherMap = this.root.get<SharedMap>("secondMap");
        otherMap.set("clicks2", 0, CounterValueType.Name);
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

    // start IComponentHTMLViewable

    /**
     * Will return a new Clicker view
     */
    public async addView(host: IComponent, div: HTMLElement): Promise<IHTMLView> {
        // Get our counter object that we set in initialize and pass it in to the view.
        const counter = this.root.get("clicks");
        const otherMap = this.root.get("secondMap");
        ReactDOM.render(
            <CounterReactView map={this.root} otherMap={otherMap} counter={counter} />,
            div,
        );
        return div;
    }

    // end IComponentHTMLViewable

    // ----- COMPONENT SETUP STUFF -----

    /**
     * This is where we do component setup.
     */
    public static async instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
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
}

// ----- REACT STUFF -----

interface p {
    map: ISharedMap;
    otherMap: ISharedMap;
    counter: Counter;
}

interface s {
    value: number;
    value2: number;
}

class CounterReactView extends React.Component<p, s> {
    constructor(props: p) {
        super(props);

        this.state = {
            value: this.props.counter.value,
            value2: this.props.otherMap.get<Counter>("clicks2").value,
        };
    }

    componentDidMount() {
        // set a listener so when the counter increments we will update our state
        // counter is annoying because it only allows you to register one listener.
        // this causes problems when we have multiple views off the same counter.
        // so we are listening to the map
        this.props.map.on("valueChanged", () => {
            this.setState({ value: this.props.counter.value });
        });

        this.props.otherMap.on("valueChanged", () => {
            this.setState({ value2: this.props.otherMap.get<Counter>("clicks2").value });
        });
    }

    render() {
        return (
            <div style={{border: "1px dotted blue"}}>
                <h3>Clicker</h3>
                <h5>Clicker on the root map increments 1</h5>
                <div>
                    <span>{this.state.value}</span>
                    <button onClick={() => { this.props.counter.increment(1); }}>+1</button>
                </div>
                <h5>Clicker on a map on the root map increments 10</h5>
                <div>
                    <span>{this.state.value2}</span>
                    <button onClick={() => { this.props.otherMap.get<Counter>("clicks2").increment(10); }}>+10</button>
                </div>
            </div>
        );
    }
}
