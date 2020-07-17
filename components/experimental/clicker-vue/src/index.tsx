/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Vue from "vue";
import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
// TODO: Move SyncedComponent to its own package to avoid a dependency on the ff/react package
// This is the only remaining mention of "react" in here
import { SyncedComponent, generateCounter, IFluidReactState } from "@fluidframework/react";
import { ISharedCounter, SharedCounter } from "@fluidframework/counter";
import { renderVue } from "@fluidframework/vue";
import Component from "vue-class-component";

// The props used by the Vue view component. This will automatically be filled by Fluid with the
// interface defined ICounterState
const VueProps = Vue.extend({
    props: {
        counter1: Object,
        counter2: Object,
    },
});

// A clicker implementation written using Vue that is powered by a SharedCounter
@Component
export class CounterVue extends VueProps {
    render(createElement) {
        return createElement("div",
            [
                createElement("span", this.counter1.value),
                createElement("button",
                    {
                        on: {
                            click: () => {
                                this.counter1.increment(1);
                            },
                        },
                    },
                    "+",
                ),
                createElement("span", this.counter2.value),
                createElement("button",
                    {
                        on: {
                            click: () => {
                                this.counter2.increment(2);
                            },
                        },
                    },
                    "++",
                ),
            ]);
    }
}

// The state definition powering the Vue view component. This is defined in SyncedComponent
// by the setConfig call in the constructor
interface ICounterState extends IFluidReactState {
    counter1?: ISharedCounter;
    counter2?: ISharedCounter;
}

/**
 * Basic ClickerVue example showing Clicker as a React Vue component
 */
export class ClickerVue extends SyncedComponent {
    constructor(props) {
        super(props);
        this.setConfig<ICounterState>(
            "clicker-vue",
            {
                syncedStateId: "clicker-vue",
                fluidToView:  new Map([
                    [
                        "counter1", generateCounter(),
                    ],
                    [
                        "counter2", generateCounter(),
                    ],
                ]),
                defaultViewState: {},
            },
        );
    }

    /**
     * Will return a new ClickerVue view
     */
    public render(div: HTMLElement) {
        renderVue(div, this, "clicker-vue", CounterVue);
        return div;
    }
}

// ----- FACTORY SETUP -----
export const ClickerVueInstantiationFactory = new PrimedComponentFactory(
    "clicker-vue",
    ClickerVue,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerVueInstantiationFactory;
