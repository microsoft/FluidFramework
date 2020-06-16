/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IIconProps, IColor } from "@fluentui/react";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { SharedObjectSequence } from "@fluidframework/sequence";

export interface IBadgeType {
    key: string;
    text: string;
    iconProps: IIconProps;
}

export interface IHistory<T> {
    value: T;
    timestamp: Date;
}

export interface IBadgeViewProps {
    options: IBadgeType[];
    historyItems: IHistory<IBadgeType>[];
    selectedOption: string | number;
    addOption: (text: string, color: IColor) => void;
    changeSelectedOption: (item: IBadgeType) => void;
}

export interface IBadgeModel {
    currentCell: SharedCell;
    optionsMap: SharedMap;
    historySequence: SharedObjectSequence<IHistory<IBadgeType>>;
}

export interface IBadgeClientProps {
    model: IBadgeModel;
}
