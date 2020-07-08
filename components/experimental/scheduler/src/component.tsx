/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { PrimedComponentFactory } from "@fluidframework/aqueduct";
import { SyncedComponent } from "@fluidframework/react";
import { SharedString, SharedObjectSequence } from "@fluidframework/sequence";
import { Container } from "./container";
import {
    peopleFluidToView,
    peopleViewToFluid,
    commentsFluidToView,
    commentsViewToFluid,
    defaultDates,
} from "./data";
import {
    IPersonViewState,
    IPersonFluidState,
    ICommentViewState,
    ICommentFluidState,
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

        this.setFluidConfig<ICommentViewState, ICommentFluidState>(
            "comments",
            {
                syncedStateId: "comments",
                fluidToView:  commentsFluidToView,
                viewToFluid: commentsViewToFluid,
                defaultViewState: { comments: [] },
            },
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
