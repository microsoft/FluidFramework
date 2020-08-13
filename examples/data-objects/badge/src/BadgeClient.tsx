/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as React from "react";
import { IColor } from "office-ui-fabric-react";
import { BadgeView } from "./BadgeView";
import { IBadgeClientProps, IBadgeType } from "./Badge.types";

/**
* The BadgeClient is a stateful, functional component that stores Fluid getters in state
* and passes those getters and setters to the BadgeView. The state is updated each time that
* the Fluid DDS's are modified.
*/

export const BadgeClient: React.FC<IBadgeClientProps> = ({ model }: IBadgeClientProps) => {
    // Setters
    const changeSelectedOption = (newItem: IBadgeType): void => {
        if (newItem.key !== model.currentCell.get().key) {
            const len = model.historySequence.getItemCount();
            model.historySequence.insert(len, [
                {
                    value: newItem,
                    timestamp: new Date(),
                },
            ]);
            model.currentCell.set(newItem);
        }
    };

    const addOption = (text: string, color: IColor): void => {
        if (text !== undefined) {
            const newItem: IBadgeType = {
                key: text,
                text,
                iconProps: {
                    iconName: "Contact",
                    style: { color: color.str },
                },
            };
            model.optionsMap.set(text, newItem);
            changeSelectedOption(newItem);
        }
    };

    // Getters
    const getOptions = () => {
        // Spread iterable out into an array
        return [...model.optionsMap.values()];
    };

    const getHistoryItems = () => {
        // return history items in reverse order so that newest is first
        const history = model.historySequence.getItems(0);
        return history.reverse();
    };

    const getSelectedOptionKey = () => {
        return model.currentCell.get().key;
    };

    // Store Fluid data in React state
    const [options, setOptions] = React.useState(getOptions());
    const [historyItems, setHistoryItems] = React.useState(getHistoryItems());
    const [selectedOption, setSelectedOption] = React.useState(getSelectedOptionKey());

    // Watch for Fluid data updates and update React state
    React.useEffect(() => {
        model.currentCell.on("valueChanged", () => {
            setSelectedOption(getSelectedOptionKey());
            setHistoryItems(getHistoryItems());
        });
    }, [model.currentCell]);

    React.useEffect(() => {
        model.optionsMap.on("valueChanged", () => {
            setOptions(getOptions());
        });
    }, [model.optionsMap]);

    // Render View
    return (
        <BadgeView
            options={options}
            historyItems={historyItems}
            selectedOption={selectedOption}
            addOption={addOption}
            changeSelectedOption={changeSelectedOption}
        />
    );
};
