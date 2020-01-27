/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EmbeddedComponent } from "@microsoft/fluid-aqueduct-react";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import GridLayout, { Layout } from "react-grid-layout";

import "../../../../node_modules/react-grid-layout/css/styles.css";
import "../../../../node_modules/react-resizable/css/styles.css";
import { ISpacesDataModel } from "./dataModel";

interface IEmbeddedComponentWrapperProps {
    id: string;
    getComponent(id: string): Promise<IComponent>;
}

interface IEmbeddedComponentWrapperState {
    element: JSX.Element;
}

/**
 * This wrapper handles the async-ness of loading a component.
 * This ideally shouldn't be here but is here for now to unblock me not knowing how to use EmbeddedComponent.
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
        const element = <EmbeddedComponent component={component} />;
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
    editable: boolean;
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
            editable: this.props.dataModel.componentList.size === 0,
            componentMap: this.props.dataModel.componentList,
        };

        this.onGridChangeEvent = this.onGridChangeEvent.bind(this);
        this.generateViewState = this.generateViewState.bind(this);
    }

    componentDidMount() {
        this.props.dataModel.on("componentListChanged", (newMap: Map<string, Layout>) => {
            this.setState({ componentMap: newMap });
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

    generateViewState(): [any[], Layout[]] {
        const array = [];
        const layouts: Layout[] = [];
        this.state.componentMap.forEach((layout, id) => {

            // Do some CSS stuff depending on if the user is editing or not
            const editableStyle: React.CSSProperties = { overflow: "hidden", padding: 2 };
            const embeddedComponentStyle: React.CSSProperties = {
                height: "100%",
            };
            if (this.state.editable) {
                editableStyle.border = "1px solid black";
                editableStyle.backgroundColor = "#d3d3d3";
                editableStyle.boxSizing = "border-box";
                editableStyle.overflow = "visible";
                embeddedComponentStyle.pointerEvents = "none";
                embeddedComponentStyle.opacity = 0.5;
            }

            // We use separate layout from array because using GridLayout
            // without passing in a new layout doesn't trigger a re-render.
            const key = `${id}`;
            layout.i = key;
            layouts.push(layout);

            const componentUrl = `${window.location.href}/${id}`;

            array.push(
                <div className="text" key={key} style={editableStyle} >
                    {
                        this.state.editable &&
                        <div style={{ opacity: 1, backgroundColor: "none", position: "absolute", bottom: 0, left: 0 }}>
                            <button onClick={() => this.props.dataModel.removeComponent(id)}>❌</button>
                            <button onClick={() => {
                                navigator.clipboard.writeText(componentUrl).then(() => {
                                    console.log("Async: Copying to clipboard was successful!");
                                }, (err) => {
                                    console.error("Async: Could not copy text: ", err);
                                });
                            }}>📎</button>
                            <button onClick={() => window.open(componentUrl, "_blank")}>↗</button>
                        </div>
                    }
                    <div style={embeddedComponentStyle}>
                        <EmbeddedComponentWrapper id={id} getComponent={this.props.dataModel.getComponent} />
                    </div>
                </div>);
        });

        return [array, layouts];
    }

    render() {
        const [array, layouts] = this.generateViewState();

        return (
            <div>
                <div style={{ position: "absolute", top: 10, left: 10, zIndex: 1000 }}>
                    <button
                        id="edit"
                        onClick={() => { this.setState({ editable: !this.state.editable }); }}
                    >
                        Edit: {this.state.editable.toString()}
                    </button>
                    {this.state.editable &&
                        <React.Fragment>
                            <span>
                                <button onClick={async () => this.props.dataModel.addComponent("clicker", 2, 2)}>
                                    Clicker
                                </button>
                                <button onClick={async () => this.props.dataModel.addComponent("button", 2, 2)}>
                                    Button
                                </button>
                                <button onClick={async () => this.props.dataModel.addComponent("number", 2, 2)}>
                                    Number
                                </button>
                                <button onClick={async () => this.props.dataModel.addComponent("textbox", 9, 6)}>
                                    TextBox
                                </button>
                                <button onClick={async () => this.props.dataModel.addComponent("facepile", 2, 4)}>
                                    FacePile
                                </button>
                                <button onClick={async () => this.props.dataModel.addComponent("codemirror", 12, 8)}>
                                    CodeMirror
                                </button>
                                <button onClick={async () => this.props.dataModel.addComponent("prosemirror", 16, 12)}>
                                    ProseMirror
                                </button>
                            </span>
                            <button onClick={() => { this.props.dataModel.saveLayout(); }}>Save Layout</button>
                        </React.Fragment>
                    }
                </div>
                {
                    this.state.componentMap.size > 0 &&
                    <GridLayout
                        className="layout"
                        cols={36}
                        rowHeight={50}
                        width={1800}
                        // eslint-disable-next-line no-null/no-null
                        compactType={null} // null is required for the GridLayout
                        isDroppable={this.state.editable}
                        isDraggable={this.state.editable}
                        isResizable={this.state.editable}
                        preventCollision={true}
                        isRearrangeable={false}
                        onResizeStop={this.onGridChangeEvent}
                        onDragStop={this.onGridChangeEvent}
                        layout={layouts}
                    >
                        {array}
                    </GridLayout>
                }
            </div>
        );
    }
}
