/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedCell } from "@microsoft/fluid-cell";
import * as React from "react";
import * as ReactGridLayout from "react-grid-layout";

import "../../node_modules/react-grid-layout/css/styles.css";
import "../../node_modules/react-resizable/css/styles.css";

export type GridCellLayout = ReactGridLayout.Layout;

export interface IFluidGridViewProps {
    storage: ISharedCell;
}

export interface IGridViewState {
    layout: GridCellLayout[];
    originalLayout: GridCellLayout[];
}

export class FluidGridView extends React.PureComponent<IFluidGridViewProps, IGridViewState> {
    public static defaultProps = {
        className: "layout",
        cols: 12,
        rowHeight: 30,
        onLayoutChange() {},
    };

    constructor(props: IFluidGridViewProps) {
        super(props);

        this.state = {
            layout: props.storage.get(),
            originalLayout: props.storage.get(),
        };

        this.onLayoutChange = this.onLayoutChange.bind(this);
        this.resetLayout = this.resetLayout.bind(this);
    }

    public async componentDidMount(): Promise<void> {
        // Set local state when changes are made to the layout in storage
        this.props.storage.on("valueChanged", changed => {
            console.log(`valueChanged: ${JSON.stringify(changed)}`);
            this.setState({ layout: this.props.storage.get() });
        });
    }

    public resetLayout() {
        console.log(`resetLayout`);
        this.props.storage.set([]);
    }

    public onLayoutChange(layout: GridCellLayout[]) {
        console.log(`onLayoutChange`);
        this.props.storage.set(layout);
    }

    public render() {
        return (
            <div>
                <button onClick={this.resetLayout}>Reset Layout</button>
                <ReactGridLayout
                    className="layout"
                    cols={12}
                    rowHeight={30}
                    width={1200}
                    layout={this.state.layout}
                    onLayoutChange={this.onLayoutChange}
                >
                    <div key="a" data-grid={{ x: 0, y: 0, w: 1, h: 2, static: true }}>
                        a
                    </div>
                    <div key="b" data-grid={{ x: 1, y: 0, w: 3, h: 2, minW: 2, maxW: 4 }}>
                        b
                    </div>
                    <div key="c" data-grid={{ x: 4, y: 0, w: 1, h: 2 }}>
                        c
                    </div>
                </ReactGridLayout>
            </div>
        );
    }
}
