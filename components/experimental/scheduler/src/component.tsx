/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SyncedComponent, setPureSyncedArrayConfig } from "@fluidframework/react";
import { SharedString, SharedObjectSequence } from "@fluidframework/sequence";
import { Container } from "./container";
import {
    peopleFluidToView,
    peopleViewToFluid,
    defaultDates,
} from "./data";
import {
    IPersonViewState,
    IPersonFluidState,
    IComment,
} from "./interface";

export class Scheduler extends SyncedComponent {
    constructor(props) {
        super(props);

        this.setFluidConfig<IPersonViewState,IPersonFluidState>(
            "people",
            {
                syncedStateId: "people",
                fluidToView:  peopleFluidToView,
                viewToFluid: peopleViewToFluid,
                defaultViewState: { people: new Map(), dates: defaultDates },
            },
        );

        setPureSyncedArrayConfig<IComment>(
            this,
            "comments",
        );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
                <Container
                    syncedComponent={this}
                />,
            div,
        );
        return div;
    }
}

export const ClickerFactory = new PrimedComponentFactory(
    "scheduler",
    Scheduler,
    [SharedString.getFactory(), SharedObjectSequence.getFactory()],
    {},
);
export const fluidExport = ClickerFactory;
