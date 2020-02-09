/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";
import { CounterValueType, Counter } from "@microsoft/fluid-map";
import { IComponentDiscoverInterfaces } from "@microsoft/fluid-framework-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

export const NumberName = "number";

const numberStyle: React.CSSProperties = {
    textAlign:"center",
    width: "100%",
    height:"100%",
    boxSizing: "border-box",
    border:"1px solid black",
};

interface INumber extends EventEmitter {
    value: number;
    on(event: "incremented", listener: (value: number) => void): this;
}

/**
 * Number clicker example using view interfaces and stock component classes.
 */
export class Number extends PrimedComponent
    implements
        IComponentHTMLVisual,
        INumber,
        IComponentDiscoverInterfaces
{
    private counter: Counter;

    public get IComponentHTMLVisual() { return this; }

    public get IComponentDiscoverInterfaces() { return this; }

    public get value() {
        return this.counter.value;
    }

    public get interfacesToDiscover(): (keyof IComponent)[] {
        return [
            "IComponentClicks",
        ];
    }

    private static readonly factory = new PrimedComponentFactory(Number, []);

    public static getFactory() {
        return Number.factory;
    }

    public increment() {
        this.counter.increment(1);
    }

    public notifyComponentsDiscovered(interfaceName: keyof IComponent, components: readonly IComponent[]): void {
        components.forEach((component) => {
            if (!component[interfaceName]) {
                console.log(`component doesn't support interface ${interfaceName}`);
            }

            switch(interfaceName) {
                case "IComponentClicks": {
                    const clicks = component.IComponentClicks;
                    if (clicks) {
                        clicks.onClick(this.increment.bind(this));
                    }
                }
                default:
            }
        });
    }

    public on(event: "incremented", listener: (value: number) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    protected async componentInitializingFirstTime(){
        this.root.createValueType("clicker-count", CounterValueType.Name, 0);
    }

    protected async componentHasInitialized() {
        this.counter = this.root.get<Counter>("clicker-count");

        this.counter.on("incremented", (_, currentValue: number) => {
            this.emit("incremented", currentValue);
        });

        const matchMaker = await this.getService<IComponent>("matchMaker");
        const interfaceRegistry = matchMaker.IComponentInterfacesRegistry;
        if (interfaceRegistry) {
            interfaceRegistry.registerComponentInterfaces(this);
        }
    }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <NumberView dataModel={this}/>,
            div,
        );
    }
}

interface INumberViewProps {
    dataModel: INumber;
}

interface INumberViewState {
    value: number;
}

class NumberView extends React.Component<INumberViewProps, INumberViewState>{
    constructor(props: INumberViewProps){
        super(props);

        this.state = {
            value: this.props.dataModel.value,
        };
    }

    componentDidMount() {
        this.props.dataModel.on("incremented", (currentValue: number) =>{
            this.setState({value:currentValue});
        });
    }

    render(){
        return (
            <div style={numberStyle}>
                <h1 style={{display:"inline-block"}}>{this.state.value}</h1>
            </div>
        );
    }
}
