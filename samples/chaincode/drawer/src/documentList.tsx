/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedMap } from "@microsoft/fluid-map";
import { DocumentCardBasicExample } from "./card";

export interface IDocumentListProps {
    values: ISharedMap;
}

export interface IDocumentListState {
    values: {
        pkg: string;
        name: string;
        version: string;
        icon: string;
        url: string;
        date: number;
        user: any;
    }[];
}

export class DocumentList extends React.Component<IDocumentListProps, IDocumentListState> {
    constructor(props) {
        super(props);
        this.state = { values: [] };
    }

    public componentDidMount() {
        this.updateState();
        this.props.values.on("valueChanged", () => this.updateState());
    }

    public render(): JSX.Element {
        const cards = this.state.values.map((value) => {
            const result =
                <div style={ { margin: "15px" } }>
                    <DocumentCardBasicExample
                        name={value.url}
                        pkg={value.pkg}
                        version={value.version}
                        icon={value.icon}
                        url={value.url}
                        date={value.date}
                        user={value.user}
                    />
                </div>;

            return result;
        });

        return (
            <div style={ { display: "flex", flexWrap: "wrap" }}>
                {cards}
            </div>
        );
    }

    private updateState() {
        this.setState({
            values: Array.from(this.props.values.keys()).map((key) => ({ ...this.props.values.get(key), url: key })),
        });
    }
}
