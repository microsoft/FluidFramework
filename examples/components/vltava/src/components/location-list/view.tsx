/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";

import { ILocationData } from "../../interfaces";
import { IListViewDataModel } from "./interfaces";

export interface ILocationListItemCreatorProps {
    addItem(item?: ILocationData): void
}

export const LocationListItemCreator = (props: ILocationListItemCreatorProps) => {
    return (
        <form onSubmit={() => props.addItem()}>
            <input
                type="text"
            />
            <button type="submit">+</button>
        </form>
    );
};

export interface IListViewProps {
    dataModel: IListViewDataModel;
}

export interface IListViewState {
    itemContent: string[];
}

export class ListView extends React.Component<IListViewProps, IListViewState> {
    constructor(props: IListViewProps) {
        super(props);

        this.state = {
            itemContent: props.dataModel.items,
        };

        props.dataModel.on("itemChanged", () => {
            this.setState({ itemContent: this.props.dataModel.items });
        });
    }

    public render() {
        const listItems: JSX.Element[] = [];
        this.state.itemContent.forEach((item) => {
            listItems.push(
                <li>{item}</li>,
            );
        });

        return (
            <ul>{listItems}</ul>
        );
    }
}

