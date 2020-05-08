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
import "./style.css";

interface ISpacesEditButtonProps {
    label: string;
    clickCallback(): void;
}

const SpacesEditButton = (props: ISpacesEditButtonProps) =>
    <button
        className="spaces-edit-button"
        onClick={props.clickCallback}
        onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
        }}
    >
        {props.label}
    </button>;

interface ISpacesEditPaneProps {
    url: string;
    removeComponent(): void;
}

const SpacesEditPane = (props: ISpacesEditPaneProps) => {
    const componentUrl = `${window.location.href}/${props.url}`;
    return (
        <div className="spaces-edit-pane">
            <SpacesEditButton label="❌" clickCallback={props.removeComponent} />
            <SpacesEditButton
                label="📎"
                clickCallback={() => {
                    navigator.clipboard.writeText(componentUrl).then(() => {
                        console.log("Async: Copying to clipboard was successful!");
                    }, (err) => {
                        console.error("Async: Could not copy text: ", err);
                    });
                }}
            />
            <SpacesEditButton label="↗️" clickCallback={() => window.open(componentUrl, "_blank")} />
        </div>
    );
};

interface ISpacesComponentViewProps {
    url: string;
    editable: boolean;
    getComponent(): Promise<IComponent | undefined>;
    removeComponent(): void;
}

interface ISpacesComponentViewState {
    component: IComponent | undefined;
}

class SpacesComponentView extends React.Component<ISpacesComponentViewProps, ISpacesComponentViewState> {
    constructor(props: ISpacesComponentViewProps) {
        super(props);
        this.state = { component: undefined };
    }

    componentDidMount() {
        this.props.getComponent()
            .then((component) => this.setState({ component }))
            .catch((error) => console.error(`Error in getting component`, error));
    }

    public render() {
        return (
            <div className="spaces-component-view">
                {
                    this.props.editable &&
                    <SpacesEditPane url={this.props.url} removeComponent={this.props.removeComponent} />
                }
                <div className="spaces-embedded-component-wrapper">
                    {
                        this.state.component &&
                        <ReactViewAdapter component={ this.state.component } />
                    }
                </div>
            </div>
        );
    }
}

interface ISpaceGridViewProps {
    dataModel: ISpacesDataModel;
}

interface ISpaceGridViewState {
    toolbarComponent: IComponent | undefined;
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
            toolbarComponent: undefined,
            editable: this.props.dataModel.componentList.size === 0,
            componentMap: this.props.dataModel.componentList,
        };

        this.onGridChangeEvent = this.onGridChangeEvent.bind(this);
        this.generateViewState = this.generateViewState.bind(this);
    }

    componentDidMount() {
        // Need an event for when the component toolbar changes
        this.props.dataModel.getComponentToolbar()
            .then((toolbarComponent) => {
                this.setState({ toolbarComponent });
            })
            .catch((error) => {
                console.error(`Error getting toolbar component`, error);
            });
        this.props.dataModel.on("componentListChanged", (newMap: Map<string, Layout>) => {
            if (this.props.dataModel.getComponentToolbar() === undefined) {
                this.setState({
                    componentMap: newMap,
                    editable: this.props.dataModel.componentList.size === 0,
                });
            } else {
                this.setState({ componentMap: newMap });
            }
        });
        this.props.dataModel.on("editableUpdated", (isEditable?: boolean) => {
            this.setState({ editable: isEditable || !this.state.editable });
        });
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

    generateViewState(): [JSX.Element | undefined, any[], Layout[]] {
        const toolbar = this.state.toolbarComponent !== undefined
            ? <ReactViewAdapter component={ this.state.toolbarComponent } />
            : undefined;
        const components: JSX.Element[] = [];
        const layouts: Layout[] = [];
        this.state.componentMap.forEach((layout, url) => {
            // We use separate layout from array because using GridLayout
            // without passing in a new layout doesn't trigger a re-render.
            layout.i = url;
            layouts.push(layout);
            components.push(
                <div key={url} className="spaces-component-view-wrapper">
                    <SpacesComponentView
                        url={url}
                        editable={this.state.editable}
                        getComponent={async () => this.props.dataModel.getComponent(url)}
                        removeComponent={() => this.props.dataModel.removeComponent(url)}
                    />
                </div>,
            );
        });

        return [toolbar, components, layouts];
    }

    render() {
        const [toolbar, components, layouts] = this.generateViewState();
        return (
            <div className={`spaces-grid-view${ this.state.editable ? " editable" : "" }`}>
                { toolbar }
                {
                    this.state.componentMap.size > 0 &&
                        <ReactGridLayout
                            className="spaces-component-grid"
                            cols={36}
                            rowHeight={50}
                            width={1800}
                            height={10000}
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
                            {components}
                        </ReactGridLayout>
                }
            </div>
        );
    }
}
