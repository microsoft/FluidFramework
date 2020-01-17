/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import Countdown360, { unitFormatterBlank } from "react-countdown360";

/**
 * Clicker example using view interfaces and stock component classes.
 */
export class BirthdayCountdown extends PrimedComponent implements IComponentHTMLVisual {

    public get IComponentHTMLVisual() { return this; }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        const timeFormatterDigitalClock = (timeLeft: number) => {
            const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
            return (`${days} Days 🎂`);
        };
        const date = new Date(2020, 1, 25);
        ReactDOM.render(
            <React.Fragment>
                <Countdown360
                    fontColor="red"
                    fontFamily="monospace"
                    fontSize={45}
                    fontWeight={100}
                    timeFormatter={timeFormatterDigitalClock}
                    unitFormatter={unitFormatterBlank}
                    // borderFillColor="#111"
                    // borderUnfillColor="#11f"
                    borderWidth={10}
                    smooth
                    seconds={(date.getTime() - Date.now()) / 1000}
                    width={190}
                />
            </React.Fragment>,
            div);
    }
}

/**
 * This is where you define all your Distributed Data Structures and Value Types
 */
export const BirthdayCountdownInstantiationFactory = new PrimedComponentFactory(
    BirthdayCountdown,
    [],
);
