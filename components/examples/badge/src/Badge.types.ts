/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IColor } from "office-ui-fabric-react";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { SharedObjectSequence } from "@fluidframework/sequence";
import { AsSerializable } from "@fluidframework/datastore-definitions";

export interface IBadgeType {
    key: string;
    text: string;
    iconProps: IBadgeIcon;
}
export interface IBadgeIcon {
    // When adding new instances, please ensure the types will still
    // be a subset of IIconProps
    iconName: string;
    style: {color: string};
}
export interface IBadgeHistory {
    value: IBadgeType;
    timestamp: Date;
}

export interface IBadgeModel {
    currentCell: SharedCell<AsSerializable<IBadgeType>>;
    optionsMap: SharedMap;
    historySequence: SharedObjectSequence<IBadgeHistory>;
}

export interface IBadgeClientProps {
    model: IBadgeModel;
}

export interface IBadgeViewProps {
    options: IBadgeType[];
    historyItems: IBadgeHistory[];
    selectedOption: string | number;
    addOption: (text: string, color: IColor) => void;
    changeSelectedOption: (item: IBadgeType) => void;
}
