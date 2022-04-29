/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IColor } from "office-ui-fabric-react";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";

export interface IBadgeType {
    key: string;
    text: string;
    iconProps: IBadgeIcon;
}
export interface IBadgeIcon {
    // When adding new instances, please ensure the types will still
    // be a subset of IIconProps
    iconName: string;
    style: { color: string };
}

export interface IBadgeModel {
    currentCell: SharedCell<IBadgeType>;
    optionsMap: SharedMap;
}

export interface IBadgeClientProps {
    model: IBadgeModel;
}

export interface IBadgeViewProps {
    options: IBadgeType[];
    selectedOption: string | number;
    addOption: (text: string, color: IColor) => void;
    changeSelectedOption: (item: IBadgeType) => void;
}
