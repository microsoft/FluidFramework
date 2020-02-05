/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { Counter } from "@microsoft/fluid-map";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
const componentName = pkg.name;

/**
 * Button does not display any content but modifies the counter count on the button click.
 */
export class Button extends PrimedComponent implements IComponentHTMLVisual {
    public get IComponentHTMLVisual() { return this; }

    public static readonly componentName = `${componentName}/button`;
    public counter: Counter;

    public render(div: HTMLDivElement) {
        // This.counter should be set by the root component. If it isn't defined yet, just return
        if (this.counter) {
            ReactDOM.render(
                <ButtonView counter={this.counter} />,
                div,
            );
        } else {
            alert("No counter provided to the Button");
            return;
        }
    }
}

interface ButtonProps {
    counter: Counter;
}

/**
 * A React button function that increments the counter on click
 */
function ButtonView(props: ButtonProps) {
    const increment = () => props.counter.increment(1);
    return <button onClick={increment}>+</button>;
}

export const ButtonInstantiationFactory = new PrimedComponentFactory(
    Button,
    [],
);
