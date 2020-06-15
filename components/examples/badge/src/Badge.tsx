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
import { IColor } from "@fluentui/react";
import { BadgeView } from "./BadgeView";
import { IHistory } from "./IHistory";
import { IBadgeType } from "./IBadgeType";
import { defaultItems } from "./helpers";

interface IBadgeModel {
    // actions
    addOption: (text: string, color: IColor) => void;
    changeSelectedOption: (newItem: IBadgeType) => void;

    // selectors
    getOptions: () => IBadgeType[];
    getHistoryItems: () => IHistory<IBadgeType>[];
    getSelectedOptionKey: () => string | number;

    // Fluid distributed data structures
    currentCell: SharedCell;
    optionsMap: SharedMap;
    historySequence: SharedObjectSequence<IHistory<IBadgeType>>;
}

interface IFluidReactClient {
    model: IBadgeModel;
}

 /**
 * The FluidReactClient is a stateful, functional component that stores Fluid queries in state
 * and passes those queries to the BadgeView. The queries state is updated each time that the Fluid DDS's
 * are modified by supplied event handlers.
 */

const FluidReactClient = ({ model }: IFluidReactClient): JSX.Element => {
    const [options, setOptions] = React.useState(model.getOptions());
    const [historyItems, setHistoryItems] = React.useState(model.getHistoryItems());
    const [selectedOption, setSelectedOption] = React.useState(model.getSelectedOptionKey());

    React.useEffect(() => {
        model.currentCell.on("valueChanged", () => {
            setSelectedOption(model.getSelectedOptionKey());
            setHistoryItems(model.getHistoryItems());
        });
    }, [model.currentCell]);

    React.useEffect(() => {
        model.optionsMap.on("valueChanged", () => {
            setOptions(model.getOptions());
        });
    }, [model.optionsMap]);

    return (
        <BadgeView
            options={options}
            historyItems={historyItems}
            selectedOption={selectedOption}
            addOption={model.addOption}
            changeSelectedOption={model.changeSelectedOption}
        />
    );
};

export class Badge extends PrimedComponent implements IBadgeModel, IComponentHTMLView {
    currentCell: SharedCell;
    optionsMap: SharedMap;
    historySequence: SharedObjectSequence<IHistory<IBadgeType>>;

    public get IComponentHTMLView() { return this; }

    private readonly currentId: string = "value";
    private readonly historyId: string = "history";
    private readonly optionsId: string = "options";

    /**
     * ComponentInitializingFirstTime is called only once, it is executed only by the first client to open the component
     * and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async componentInitializingFirstTime() {
        // Create a cell to represent the Badge's current state
        const current = SharedCell.create(this.runtime);
        current.set(defaultItems[0]);
        this.root.set(this.currentId, current.handle);

        // Create a map to represent the options for the Badge
        const options = SharedMap.create(this.runtime);
        defaultItems.forEach((v) => options.set(v.key, v));
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
        ReactDOM.render(<FluidReactClient model={this} />, div);
    }

    /**
     * Public methods that a view can use to access and modify the model.
     */
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
}
