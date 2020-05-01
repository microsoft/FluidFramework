/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactViewAdapter } from "@microsoft/fluid-view-adapters";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import RGL, { WidthProvider, Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
const ReactGridLayout = WidthProvider(RGL);
import { ISpacesDataModel } from "./dataModel";

interface IEmbeddedComponentWrapperProps {
    componentP: Promise<IComponent | undefined>;
}

interface IEmbeddedComponentWrapperState {
    element: JSX.Element;
}

const buttonContainerStyle: React.CSSProperties = {
    opacity: 1,
    backgroundColor: "none",
    position: "absolute",
    bottom: 0,
    left: 0,
};

const buttonStyle: React.CSSProperties = {
    width: "2rem",
    height: "2rem",
};

const gridContainerStyle: React.CSSProperties = { paddingTop: "7rem", minHeight: "3000px", width: "100%" };

/**
 * This wrapper handles the async-ness of loading a component.
 * This ideally shouldn't be here but is here for now to unblock me not knowing how to use ReactViewAdapter.
 */
class EmbeddedComponentWrapper extends React.Component<IEmbeddedComponentWrapperProps, IEmbeddedComponentWrapperState> {
    constructor(props) {
        super(props);
        this.state = {
            element: <span></span>,
        };
    }

    async componentDidMount() {
        const component = await this.props.componentP;
        if (component) {
            const element = <ReactViewAdapter component={component} />;
            this.setState({ element });
        }
    }

    public render() {
        return this.state.element;
    }
}

interface ISpaceGridViewProps {
    dataModel: ISpacesDataModel;
}

interface ISpaceGridViewState {
    isEditable: boolean;
    componentMap: Map<string, Layout>;
}

/**
 * The view is a React Component that knows how to interact with a
 * specific data model and doesn't have any dependencies on fluid.
 */
export class SpacesGridView extends React.Component<ISpaceGridViewProps, ISpaceGridViewState> {
    constructor(props) {
        super(props);
        this.state = {
            isEditable: this.props.dataModel.componentList.size === 1,
            componentMap: this.props.dataModel.componentList,
        };

        this.onGridChangeEvent = this.onGridChangeEvent.bind(this);
        this.generateViewState = this.generateViewState.bind(this);
    }

    componentDidMount() {
        this.props.dataModel.on("componentListChanged", (newMap: Map<string, Layout>) => {
            if (this.props.dataModel.getComponentToolbar() === undefined) {
                this.setState({
                    componentMap: newMap,
                    isEditable: this.props.dataModel.componentList.size === 1,
                });
            } else {
                this.setState({ componentMap: newMap });
            }
        });
        this.props.dataModel.on("editableUpdated", (isEditable?: boolean) => {
            this.setState({ isEditable: isEditable || !this.state.isEditable });
        });
    }

    // This is kinda hacky. Is there a better way?
    // Maybe instead of passing the model we pass a callback to get a model. In that scenario model changes
    // shouldn't trigger a re-render
    shouldComponentUpdate(_nextProps, nextState) {
        if (nextState !== this.state) {
            return true;
        }

        // We don't want to trigger re-render on data model changes since the component already handles them.
        return false;
    }

    onGridChangeEvent(
        layout: Layout[],
        oldItem: Layout,
        newItem: Layout,
        placeholder: Layout,
        event: MouseEvent,
        element: HTMLElement,
    ) {
        const id = newItem.i.split("_")[0];
        this.props.dataModel.updateGridItem(id, newItem);
    }

    generateEditControls(url: string): JSX.Element {
        const componentUrl = `${window.location.href}/${url}`;
        return (
            <div style={buttonContainerStyle}>
                <button
                    style={buttonStyle}
                    onClick={() => this.props.dataModel.removeComponent(url)}
                    onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                    }}
                >
                    {"❌"}
                </button>
                <button
                    style={buttonStyle}
                    onClick={
                        () => {
                            navigator.clipboard.writeText(componentUrl).then(() => {
                                console.log("Async: Copying to clipboard was successful!");
                            }, (err) => {
                                console.error("Async: Could not copy text: ", err);
                            });
                        }}
                    onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                    }}
                >
                    {"📎"}
                </button>
                <button
                    style={buttonStyle}
                    onClick={() => window.open(componentUrl, "_blank")}
                    onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                    }}
                >
                    {"↗️"}
                </button>
            </div>
        );
    }

    getToolbarElement(): JSX.Element | undefined {
        return (
            <div className="text" style={{ padding: 2 }} >
                <div style={{ height: "100%" }}>
                    <EmbeddedComponentWrapper componentP={ this.props.dataModel.getComponentToolbar() } />
                </div>
            </div>
        );
    }

    getNonToolbarElement(url: string): JSX.Element {
        const editable = this.state.isEditable && url !== this.props.dataModel.componentToolbarUrl;
        // Do some CSS stuff depending on if the user is editing or not
        const editableStyle: React.CSSProperties = { padding: 2 };
        const embeddedComponentStyle: React.CSSProperties = {
            height: "100%",
        };
        if (editable) {
            editableStyle.border = "1px solid black";
            editableStyle.backgroundColor = "#d3d3d3";
            editableStyle.boxSizing = "border-box";
            editableStyle.overflow = "hidden";
            embeddedComponentStyle.pointerEvents = "none";
            embeddedComponentStyle.opacity = 0.5;
        }
        if (url !== this.props.dataModel.componentToolbarUrl && !editable) {
            editableStyle.overflow = "scroll";
        }

        return (
            <div className="text" key={url} style={editableStyle} >
                {
                    editable &&
                    this.generateEditControls(url)
                }
                <div style={embeddedComponentStyle}>
                    <EmbeddedComponentWrapper componentP={ this.props.dataModel.getComponent(url) } />
                </div>
            </div>
        );
    }

    generateViewState(): [any[], Layout[]] {
        const components: JSX.Element[] = [];
        const layouts: Layout[] = [];

        this.state.componentMap.forEach((layout, url) => {
            if (url !== this.props.dataModel.componentToolbarUrl) {
                // We use separate layout from array because using GridLayout
                // without passing in a new layout doesn't trigger a re-render.
                layout.i = url;
                layouts.push(layout);
                components.push(this.getNonToolbarElement(url));
            }
        });

        return [components, layouts];
    }

    render() {
        const [components, layouts] = this.generateViewState();
        return (
            <div>
                {this.getToolbarElement()}
                {
                    this.state.componentMap.size > 0 &&
                        <ReactGridLayout
                            className="layout"
                            cols={36}
                            rowHeight={50}
                            width={1800}
                            height={10000}
                            // eslint-disable-next-line no-null/no-null
                            compactType={null} // null is required for the GridLayout
                            isDroppable={this.state.isEditable}
                            isDraggable={this.state.isEditable}
                            isResizable={this.state.isEditable}
                            preventCollision={true}
                            isRearrangeable={false}
                            onResizeStop={this.onGridChangeEvent}
                            onDragStop={this.onGridChangeEvent}
                            layout={layouts}
                            style={gridContainerStyle}
                        >
                            {components}
                        </ReactGridLayout>
                }
            </div>
        );
    }
}
