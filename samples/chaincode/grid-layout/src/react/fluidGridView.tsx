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
}

export class FluidGridView extends React.Component<IFluidGridViewProps, IGridViewState> {
    constructor(props: Readonly<IFluidGridViewProps>) {
        super(props);

        this.state = {
            layout: props.storage.get(),
        };

        this.onLayoutChange = this.onLayoutChange.bind(this);
        this.resetLayout = this.resetLayout.bind(this);
    }

    public async componentDidMount(): Promise<void> {
        // Set local state when changes are made to the layout in storage
        this.props.storage.on("valueChanged", (changed, local, op) => {
            const prev = changed.previousValue as GridCellLayout[];
            console.log(
                `${local ? "Local" : "Remote"} valueChanged: ${changed.key} ==> ${JSON.stringify(
                    changed
                )} :: was ${JSON.stringify(prev)})`
            );

            this.setState({ layout: this.props.storage.get() });
        });
    }

    public resetLayout() {
        const layout = new Array<GridCellLayout>();
        this.setState({
            layout,
        });
    }

    public onLayoutChange(layout: GridCellLayout[]) {
        console.log(`onLayoutChange called`);
        this.props.storage.set(layout);
        // this.props.onLayoutChange(layout); // updates status display
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
            // <div>
            //     <button onClick={this.resetLayout}>Reset Layout</button>
            //     <ReactGridLayout {...this.props} layout={this.state.layout} onLayoutChange={this.onLayoutChange}>
            //         <div key="1" data-grid={{ w: 2, h: 3, x: 0, y: 0 }}>
            //             <span className="text">1</span>
            //         </div>
            //         <div key="2" data-grid={{ w: 2, h: 3, x: 2, y: 0 }}>
            //             <span className="text">2</span>
            //         </div>
            //         <div key="3" data-grid={{ w: 2, h: 3, x: 4, y: 0 }}>
            //             <span className="text">3</span>
            //         </div>
            //         <div key="4" data-grid={{ w: 2, h: 3, x: 6, y: 0 }}>
            //             <span className="text">4</span>
            //         </div>
            //         <div key="5" data-grid={{ w: 2, h: 3, x: 8, y: 0 }}>
            //             <span className="text">5</span>
            //         </div>
            //     </ReactGridLayout>
            // </div>
        );
    }
}
