/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent } from "@prague/aqueduct";
import { ComponentRuntime } from "@prague/component-runtime";
import {
    IComponentHTMLVisual,
    IRequest,
} from "@prague/container-definitions";
import { IComponentForge } from "@prague/framework-definitions";
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
export const ClickerWithForgeName = `${pkg.name as string}-clickerWithForge`;

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class ClickerWithForge extends PrimedComponent implements IComponentHTMLVisual, IComponentForge {
    private static readonly supportedInterfaces =
        ["IComponentHTMLVisual", "IComponentHTMLRender", "IComponentRouter", "IComponentForge"];

    private hasForged = false;

    /**
     * Do setup work here
     */
    protected async create() {
        // This allows the PrimedComponent to create the root map
        await super.create();

        this.hasForged = this.runtime.existing;
        this.root.set("clicks", 0, CounterValueType.Name);
    }

    /**
     * Forge is executed after created and before attach.
     */
    public async forge(props: any): Promise<void> {
        // forging should only happen by the creator
        if (this.runtime.existing || this.hasForged) {
            return;
        }

        // We only want to allow forging to happen once.
        this.hasForged = true;

        if (props && props.initialValue) {
            const clicks = this.root.get<Counter>("clicks");
            clicks.increment(props.initialValue);
        }
    }

    /**
     * Static load function that allows us to make async calls while creating our object.
     * This becomes the standard practice for creating components in the new world.
     * Using a static allows us to have async calls in class creation that you can't have in a constructor
     */
    public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<ClickerWithForge> {
        const clicker = new ClickerWithForge(runtime, context, ClickerWithForge.supportedInterfaces);
        await clicker.initialize();

        return clicker;
    }

    // start IComponentHTMLVisual

    public render(div: HTMLElement) {
        // Get our counter object that we set in initialize and pass it in to the view.
        const counter = this.root.get("clicks");
        ReactDOM.render(
            <CounterReactView map={this.root}counter={counter} />,
            div,
        );
    }

    // end IComponentHTMLVisual

    // ----- COMPONENT SETUP STUFF -----

    /**
     * This is where we do component setup.
     */
    public static instantiateComponent(context: IComponentContext): void {
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
        ComponentRuntime.load(
            context,
            dataTypes,
            (runtime) => {
                // Create a new instance of our component
                const counterNewP = ClickerWithForge.load(runtime, context);

                // Add a handler for the request() on our runtime to send it to our component
                // This will define how requests to the runtime object we just created gets handled
                // Here we want to simply defer those requests to our component
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const counter = await counterNewP;
                    return counter.request(request);
                });
            });
    }
}

// ----- REACT STUFF -----

interface p {
    map: ISharedMap;
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
            <div style={{border: "1px dotted red"}}>
                <h3>Clicker With Forge</h3>
                <h5>Forged with initial value of 100. Increments 5.</h5>
                <div>
                    <span>{this.state.value}</span>
                    <button onClick={() => { this.props.counter.increment(5); }}>+5</button>
                </div>
            </div>
        );
    }
}
