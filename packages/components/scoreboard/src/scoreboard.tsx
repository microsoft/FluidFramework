/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CounterValueType } from "@microsoft/fluid-map";
import { PrimedComponent, PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLOptions,
    IComponentHTMLView,
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { TeamScore } from "./teamScore";
import { WinnerText } from "./winnerText";

export class Scoreboard extends PrimedComponent implements IComponentHTMLView, IComponentHTMLVisual {
    public static readonly componentName = "Scoreboard";

    public get IComponentHTMLVisual() { return this; }

    /**
    * Setup the distributed data structures; called once when the component is created (NOT initialized)
    */
    protected async componentInitializingFirstTime() {
        this.root.createValueType("Hardcoders", CounterValueType.Name, 0);
        this.root.createValueType("Chaincoders", CounterValueType.Name, 0);
    }

    render(hostingElement: HTMLElement, options?: IComponentHTMLOptions): void {
        ReactDOM.render(
            <div className="container">
                <section className="hero is-info">
                    <div className="hero-body">
                        <div className="container">
                            <h1 className="title">
                                Scoreboard
                            </h1>
                            <h2 className="subtitle">
                                Hardcoders vs. Chaincoders
                            </h2>
                        </div>
                    </div>
                </section>
                <div className="columns is-mobile is-gapless">
                    <div className="column">
                        <TeamScore
                            name="Hardcoders"
                            counter={this.root.get("Hardcoders")}
                            colorClass="has-background-warning" />
                    </div>
                    <div className="column">
                        <TeamScore
                            name="Chaincoders"
                            counter={this.root.get("Chaincoders")}
                            colorClass="has-background-grey-light" />
                    </div>
                </div>
                <div>
                    <WinnerText directory={this.root} />
                </div>
            </div>,
            hostingElement);
    }
}

/**
 * This is where we define the Distributed Data Structures this component uses
 */
const ScoreboardComponentInstantiationFactory = new PrimedComponentFactory(
    Scoreboard,
    [],
);

/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also enables dynamic loading in the
 * EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
    Scoreboard.componentName,
    new Map([
        [Scoreboard.componentName, Promise.resolve(ScoreboardComponentInstantiationFactory)],
    ]),
);
