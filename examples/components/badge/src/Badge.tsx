/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { IComponentReactViewable } from "@microsoft/fluid-aqueduct-react";
import { SharedCell } from "@microsoft/fluid-cell";
import {
    IComponentHandle,
    IComponentHTMLView,
} from "@microsoft/fluid-component-core-interfaces";
import { SharedMap } from "@microsoft/fluid-map";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";
// eslint-disable-next-line import/no-internal-modules
import { SharedColors } from "@uifabric/fluent-theme/lib/fluent/FluentColors";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { IBadgeType } from "./IBadgeType";
import { BadgeView } from "./BadgeView";
import { IHistory } from "./IHistory";

export class Badge extends PrimedComponent implements
    IComponentHTMLView,
    IComponentReactViewable {
    currentCell: SharedCell;
    optionsMap: SharedMap;
    historySequence: SharedObjectSequence<IHistory<IBadgeType>>;

    public get IComponentHTMLView() { return this; }
    public get IComponentReactViewable() { return this; }

    private readonly currentId: string = "value";
    private readonly historyId: string = "history";
    private readonly optionsId: string = "options";

    private readonly defaultOptions: IBadgeType[] = [
        {
            key: "drafting",
            text: "Drafting",
            iconProps: {
                iconName: "Edit",
                style: {
                    color: SharedColors.cyanBlue10,
                },
            },
        },
        {
            key: "reviewing",
            text: "Reviewing",
            iconProps: {
                iconName: "Chat",
                style: {
                    color: SharedColors.orange20,
                },
            },
        },
        {
            key: "complete",
            text: "Complete",
            iconProps: {
                iconName: "Completed",
                style: {
                    color: SharedColors.green10,
                },
            },
        },
        {
            key: "archived",
            text: "Archived",
            iconProps: {
                iconName: "Archive",
                style: {
                    color: SharedColors.magenta10,
                },
            },
        },
    ];

    /**
     * ComponentInitializingFirstTime is called only once, it is executed only by the first client to open the component
     * and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async componentInitializingFirstTime() {
        // Create a cell to represent the Badge's current state
        const current = SharedCell.create(this.runtime);
        current.set(this.defaultOptions[0]);
        this.root.set(this.currentId, current.handle);

        // Create a map to represent the options for the Badge
        const options = SharedMap.create(this.runtime);
        this.defaultOptions.forEach((v) => options.set(v.key, v));
        this.root.set(this.optionsId, options.handle);

        // Create a sequence to store the badge's history
        const history = SharedObjectSequence.create<IHistory<IBadgeType>>(this.runtime);
        history.insert(0, [{
            value: current.get(),
            timestamp: new Date(),
        }]);
        this.root.set(this.historyId, history.handle);
    }

    /**
     * In order to retrieve values from the SharedDirectory/Map, we must use await, so we need an async function.
     * This function stashes local references to the Shared objects that we want to pass into the React component
     * in render (see createJSXElement). That way our render method, which cannot be async, can pass in the Shared
     * object refs as props to the React component.
     */
    protected async componentHasInitialized() {
        this.currentCell = await this.root.get<IComponentHandle>(this.currentId).get<SharedCell>();
        this.optionsMap = await this.root.get<IComponentHandle>(this.optionsId).get<SharedMap>();
        this.historySequence = await this.root.get<IComponentHandle>(this.historyId).get<SharedObjectSequence<IHistory<IBadgeType>>>();
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            this.createJSXElement(),
            div,
        );
    }

    public remove() {
        throw new Error("Not Implemented");
    }

    public createJSXElement(): JSX.Element {
        const divStyle = {
            display: "inline-block",
        };

        return (
            <div style={divStyle}>
                <BadgeView
                    currentCell={this.currentCell}
                    optionsMap={this.optionsMap}
                    historySequence={this.historySequence} />
            </div>
        );
    }
}
