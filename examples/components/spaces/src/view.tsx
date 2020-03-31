/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactViewAdapter } from "@microsoft/fluid-view-adapters";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import RGL, { WidthProvider, Layout } from "react-grid-layout";
// eslint-disable @typescript-eslint/no-require-imports
require("react-grid-layout/css/styles.css");
// eslint-enable @typescript-eslint/no-require-imports
const ReactGridLayout = WidthProvider(RGL);
import { ISpacesDataModel } from "./dataModel";


interface IEmbeddedComponentWrapperProps {
    id: string;
    getComponent: (componentId: string) => Promise<IComponent>;
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

const gridContainerStyle: React.CSSProperties = { paddingTop: "5rem" };

/**
 * This wrapper handles the async-ness of loading a component.
 * This ideally shouldn't be here but is here for now to unblock me not knowing how to use ReactViewAdapter.
 */
class EmbeddedComponentWrapper extends React.Component<IEmbeddedComponentWrapperProps, IEmbeddedComponentWrapperState>{
    constructor(props) {
        super(props);
        this.state = {
            element: <span></span>,
        };
    }

    async componentDidMount() {
        const component = await this.props.getComponent(this.props.id);
        const element = <ReactViewAdapter component={component} />;
        this.setState({ element });
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
            isEditable: this.props.dataModel.componentList.size - 1 === 0,
            componentMap: this.props.dataModel.componentList,
        };

        this.onGridChangeEvent = this.onGridChangeEvent.bind(this);
        this.generateViewState = this.generateViewState.bind(this);
    }

    componentDidMount() {
        this.props.dataModel.on("componentListChanged", (newMap: Map<string, Layout>) => {
            if (!this.state.componentMap.get(this.props.dataModel.componentToolbarId)) {
                this.setState({
                    componentMap: newMap,
                    isEditable: this.props.dataModel.componentList.size - 1 === 0,
                });
            } else {
                this.setState({ componentMap: newMap });
            }
        });
        this.props.dataModel.on("editableUpdated", (isEditable?: boolean) => {
            this.setState({isEditable: isEditable || !this.state.isEditable});
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

    generateViewState(): [JSX.Element, any[], Layout[]] {
        const components: JSX.Element[] = [];
        const layouts: Layout[] = [];
        let componentToolbar: JSX.Element | undefined;

        this.state.componentMap.forEach((layout, id) => {
            const editable = this.state.isEditable && id !== this.props.dataModel.componentToolbarId;
            // Do some CSS stuff depending on if the user is editing or not
            const editableStyle: React.CSSProperties = { overflow: "hidden", padding: 2 };
            const embeddedComponentStyle: React.CSSProperties = {
                height: "100%",
            };
            if (editable) {
                editableStyle.border = "1px solid black";
                editableStyle.backgroundColor = "#d3d3d3";
                editableStyle.boxSizing = "border-box";
                editableStyle.overflow = "visible";
                embeddedComponentStyle.pointerEvents = "none";
                embeddedComponentStyle.opacity = 0.5;
            }
            if (id !== this.props.dataModel.componentToolbarId) {
                embeddedComponentStyle.overflow = "scroll";
            }

            // We use separate layout from array because using GridLayout
            // without passing in a new layout doesn't trigger a re-render.
            const key = `${id}`;
            layout.i = key;
            layouts.push(layout);

            const componentUrl = `${window.location.href}/${id}`;
            const element =
                <div className="text" key={key} style={editableStyle} >
                    {
                        editable &&
                        <div style={buttonContainerStyle}>
                            <button
                                style={buttonStyle}
                                onClick={() => this.props.dataModel.removeComponent(id)}
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
                    }
                    <div style={embeddedComponentStyle}>
                        <EmbeddedComponentWrapper id={id} getComponent={this.props.dataModel.getComponent} />
                    </div>
                </div>;
            if (id !== this.props.dataModel.componentToolbarId) {
                components.push(element);
            } else {
                componentToolbar = element;
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return [componentToolbar!, components, layouts];
    }

    render() {
        const [componentToolbar, components, layouts] = this.generateViewState();
        return (
            <div>
                {componentToolbar}
                {
                    this.state.componentMap.size > 0 &&
                        <ReactGridLayout
                            className="layout"
                            cols={36}
                            rowHeight={50}
                            width={1800}
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
