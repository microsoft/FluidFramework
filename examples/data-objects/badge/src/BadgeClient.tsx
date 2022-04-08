/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as React from "react";
import { IColor } from "office-ui-fabric-react";
import { BadgeView } from "./BadgeView";
import { IBadgeClientProps, IBadgeType } from "./Badge.types";

/**
* The BadgeClient is a stateful, functional component that stores Fluid getters in state
* and passes those getters and setters to the BadgeView. The state is updated each time that
* the Fluid DDSess are modified.
*/

export const BadgeClient: React.FC<IBadgeClientProps> = ({ model }: IBadgeClientProps) => {
    // Setters
    const changeSelectedOption = (newItem: IBadgeType): void => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (newItem.key !== model.currentCell.get()!.key) {
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return [...model.optionsMap.values()];
    };

    const getSelectedOptionKey = () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return model.currentCell.get()!.key;
    };

    // Store Fluid data in React state
    const [options, setOptions] = React.useState(getOptions());
    const [selectedOption, setSelectedOption] = React.useState(getSelectedOptionKey());

    // Watch for Fluid data updates and update React state
    React.useEffect(() => {
        model.currentCell.on("valueChanged", () => {
            setSelectedOption(getSelectedOptionKey());
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
            selectedOption={selectedOption}
            addOption={addOption}
            changeSelectedOption={changeSelectedOption}
        />
    );
};
