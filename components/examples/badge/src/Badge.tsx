/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { PrimedComponent } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { SharedMap } from "@fluidframework/map";
import { SharedObjectSequence } from "@fluidframework/sequence";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
// eslint-disable-next-line import/no-internal-modules
import { SharedColors } from "@uifabric/fluent-theme/lib/fluent/FluentColors";
import { IColor } from "office-ui-fabric-react";
import { BadgeView } from "./BadgeView";
import { IHistory } from "./IHistory";
import { IBadgeType } from "./IBadgeType";

interface IBadgeModel {
    addOption: (text: string, color: IColor) => void;
    changeSelectedOption: (newItem: IBadgeType) => void;
    getOptions: () => Iterable<any>;
    getHistoryItems: () => IHistory<IBadgeType>[];
    getSelectedOptionKey: () => any
}

export class Badge extends PrimedComponent implements IBadgeModel, IComponentHTMLView {
    currentCell: SharedCell;
    optionsMap: SharedMap;
    historySequence: SharedObjectSequence<IHistory<IBadgeType>>;

    public get IComponentHTMLView() { return this; }

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
        const badgeHistory = SharedObjectSequence.create<IHistory<IBadgeType>>(this.runtime);
        badgeHistory.insert(0, [{
            value: current.get(),
            timestamp: new Date(),
        }]);
        this.root.set(this.historyId, badgeHistory.handle);
    }

    /**
     * In order to retrieve values from the SharedDirectory/Map, we must use await, so we need an async function.
     * This function stashes local references to the Shared objects that we want to pass into the React component
     * in render (see FluidReactClient). That way our render method, which cannot be async, can pass in the Shared
     * object refs as props to the React component.
     */
    protected async componentHasInitialized() {
        this.currentCell = await this.root.get<IComponentHandle<SharedCell>>(this.currentId).get();
        this.optionsMap = await this.root.get<IComponentHandle<SharedMap>>(this.optionsId).get();
        this.historySequence = await this.root.get<IComponentHandle<SharedObjectSequence<IHistory<IBadgeType>>>>(this.historyId).get();
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            React.createElement(this.FluidReactClient),
            div,
        );
    }

    public remove() {
        throw new Error("Not Implemented");
    }

    public addOption = (text: string, color: IColor): void => {
        if (text !== undefined) {
            const newItem: IBadgeType = {
                key: text,
                text,
                iconProps: {
                    iconName: "Contact",
                    style: {
                        color: color.str,
                    },
                },
            };
            this.optionsMap.set(text, newItem);
            this.changeSelectedOption(newItem);
        }
    };

    public changeSelectedOption = (newItem: IBadgeType): void => {
        if (newItem.key !== this.currentCell.get().key) {
            // Save current value into history
            const len = this.historySequence.getItemCount();
            this.historySequence.insert(len, [
                {
                    value: newItem,
                    timestamp: new Date(),
                },
            ]);

            // Set new value
            this.currentCell.set(newItem);
        }
    };

    public getOptions = () => {
        return [...this.optionsMap.values()];
    };

    public getHistoryItems = () => {
        return this.historySequence.getItems(0);
    };

    public getSelectedOptionKey() {
        return this.currentCell.get().key;
    }

    /**
    * The FluidReactClient is a stateful functional component that stores Fluid queries in state
    * and passes those queries to the BadgeView. The queries state is updated each time that the Fluid DDS's
    * are modified by supplied event handlers.
    */

    public FluidReactClient: React.FC = (): JSX.Element => {
        const [options, setOptions] = React.useState(this.getOptions());
        const [historyItems, setHistoryItems] = React.useState(this.getHistoryItems());
        const [selectedOption, setSelectedOption] = React.useState(this.getSelectedOptionKey());

        React.useEffect(() => {
            this.currentCell.on("valueChanged", () => {
                setSelectedOption(this.getSelectedOptionKey());
                setHistoryItems(this.getHistoryItems());
            });
        }, [this.currentCell]);

        React.useEffect(() => {
            this.optionsMap.on("valueChanged", () => {
                setOptions(this.getOptions());
            });
        }, [this.optionsMap]);

        return (
            <BadgeView
                options={options}
                historyItems={historyItems}
                selectedOption={selectedOption}
                addOption={this.addOption}
                changeSelectedOption={this.changeSelectedOption}
            />
        );
    };
}
