/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponent, IComponentHTMLVisual, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { Counter, CounterValueType, ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import * as React from "react";
import * as ReactDOM from "react-dom";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../package.json");
export const ClickerWithInitialValueName = `${pkg.name as string}-clickerWithInitialValue`;

declare module "@microsoft/fluid-component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentClickerWithInitialValueCreator>> {
    }
}

export interface IProvideComponentClickerWithInitialValueCreator {
    readonly IComponentClickerWithInitialValueCreator: IComponentClickerWithInitialValueCreator;
}

/**
 * A component that implements a collection of components.  Typically, the
 * components in the collection would be like-typed.
 */
export interface IComponentClickerWithInitialValueCreator extends IProvideComponentClickerWithInitialValueCreator {
    createClickerComponent(
        props: IClickerWithInitialValueProps,
        context: IComponentContext): Promise<IComponent>;
}

export interface IClickerWithInitialValueProps {
    initialValue: number;
}

export class ClickerWithInitialValueFactory
    extends PrimedComponentFactory implements IComponentClickerWithInitialValueCreator {

        public get IComponentClickerWithInitialValueCreator() { return this; }

        public async createClickerComponent(
            props: IClickerWithInitialValueProps,
            context: IComponentContext): Promise<IComponent> {
                const cr = await context.hostRuntime.createComponentDirect(
                    this.registryName, this.create(props));
                const response = await cr.request({url: "/"});
                if (response.status !== 200 || response.mimeType !== "fluid/component") {
                    throw new Error("Failed to create component");
                }

                cr.attach();
                return response.value as IComponent;
            }

        private create(props: IClickerWithInitialValueProps) {
            return (context: IComponentContext) => {
                // Create a new runtime for our component
                // The runtime is what Fluid uses to create DDS' and route to your component
                ComponentRuntime.load(
                    context,
                    this.sharedObjectRegistry,
                    (runtime: ComponentRuntime) => {
                        const clicker = new ClickerWithInitialValue(runtime, context, props);
                        const clickerP = clicker.initialize();

                        runtime.registerRequestHandler(async (request: IRequest) => {
                            await clickerP;
                            return clicker.request(request);
                        });
                    },
                );
            };
        }
}

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class ClickerWithInitialValue extends PrimedComponent implements IComponentHTMLVisual {

    public get IComponentHTMLVisual() { return this; }

    public constructor(
        runtime: IComponentRuntime,
        context: IComponentContext,
        private readonly props?: IClickerWithInitialValueProps,
    ) {
        super(runtime, context);
    }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        let startingValue = 0;
        if (this.props) {
            startingValue = this.props.initialValue;
        }

        this.root.createValueType("clicks", CounterValueType.Name, startingValue);
    }

    // start IComponentHTMLVisual

    public render(div: HTMLElement) {
        // Get our counter object that we set in initialize and pass it in to the view.
        const counter = this.root.get("clicks");
        ReactDOM.render(
            <CounterReactView directory={this.root}counter={counter} />,
            div,
        );
    }

    // end IComponentHTMLVisual

    // ----- COMPONENT SETUP STUFF -----

    // ----- COMPONENT SETUP STUFF -----

    public static getFactory() { return ClickerWithInitialValue.factory; }

    private static readonly factory = new ClickerWithInitialValueFactory(
        ClickerWithInitialValue,
        [],
    );
}

// ----- REACT STUFF -----

interface p {
    directory: ISharedDirectory;
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
        // so we are listening to the directory
        this.props.directory.on("valueChanged", () => {
            this.setState({ value: this.props.counter.value });
        });
    }

    render() {
        return (
            <div style={{border: "1px dotted red"}}>
                <h3>Clicker With Initial Value</h3>
                <h5>Created with initial value of 100. Increments 5.</h5>
                <div>
                    <span>{this.state.value}</span>
                    <button onClick={() => { this.props.counter.increment(5); }}>+5</button>
                </div>
            </div>
        );
    }
}
