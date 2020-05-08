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
import { SpacesCompatibleToolbar, IComponentSpacesToolbarProps } from "./interfaces";
import { ISpacesStoredComponent } from "./spaces";
import { ISpacesStorageModel } from "./spacesStorage";
import "./style.css";

interface ISpacesEditButtonProps {
    clickCallback(): void;
}

const SpacesEditButton: React.FC<ISpacesEditButtonProps> =
    (props: React.PropsWithChildren<ISpacesEditButtonProps>) =>
        <button
            className="spaces-edit-button"
            onClick={props.clickCallback}
            onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
            }}
        >
            {props.children}
        </button>;

interface ISpacesEditPaneProps {
    url: string;
    removeComponent(): void;
}

const SpacesEditPane: React.FC<ISpacesEditPaneProps> =
    (props: React.PropsWithChildren<ISpacesEditPaneProps>) => {
        const componentUrl = `${window.location.href}/${props.url}`;
        return (
            <div className="spaces-edit-pane">
                <SpacesEditButton clickCallback={props.removeComponent}>❌</SpacesEditButton>
                <SpacesEditButton
                    clickCallback={() => {
                        navigator.clipboard.writeText(componentUrl).then(() => {
                            console.log("Async: Copying to clipboard was successful!");
                        }, (err) => {
                            console.error("Async: Could not copy text: ", err);
                        });
                    }}
                >📎</SpacesEditButton>
                <SpacesEditButton clickCallback={() => window.open(componentUrl, "_blank")}>↗️</SpacesEditButton>
            </div>
        );
    };

interface ISpacesComponentViewProps {
    url: string;
    editable: boolean;
    getComponent(): Promise<IComponent | undefined>;
    removeComponent(): void;
}

const SpacesComponentView: React.FC<ISpacesComponentViewProps> =
    (props: React.PropsWithChildren<ISpacesComponentViewProps>) => {
        const [component, setComponent] = React.useState<IComponent | undefined>(undefined);

        React.useEffect(() => {
            props.getComponent()
                .then(setComponent)
                .catch((error) => console.error(`Error in getting component`, error));
        });

        return (
            <div className="spaces-component-view">
                {
                    props.editable &&
                    <SpacesEditPane url={props.url} removeComponent={props.removeComponent} />
                }
                <div className="spaces-embedded-component-wrapper">
                    {
                        component &&
                        <ReactViewAdapter component={ component } />
                    }
                </div>
            </div>
        );
    };

interface ISpacesStorageViewProps {
    storage: ISpacesStorageModel;
    editable: boolean;
}
export const SpacesStorageView: React.FC<ISpacesStorageViewProps> =
    (props: React.PropsWithChildren<ISpacesStorageViewProps>) => {
        // Render nothing if there are no components
        if (props.storage.componentList.size === 0) {
            return <></>;
        }

        const [componentMap, setComponentMap] =
            React.useState<Map<string, ISpacesStoredComponent>>(props.storage.componentList);

        React.useEffect(() => {
            const onComponentListChanged = (newMap: Map<string, Layout>) => {
                setComponentMap(newMap);
            };
            props.storage.on("componentListChanged", onComponentListChanged);
            return () => {
                props.storage.off("componentListChanged", onComponentListChanged);
            };
        });

        const onGridChangeEvent = (
            layout: Layout[],
            oldItem: Layout,
            newItem: Layout,
            placeholder: Layout,
            event: MouseEvent,
            element: HTMLElement,
        ) => {
            const key = newItem.i.split("_")[0];
            props.storage.updateLayout(key, newItem);
        };

        const components: JSX.Element[] = [];
        const layouts: Layout[] = [];
        componentMap.forEach((model, url) => {
            const layout = model.layout;
            // We use separate layout from array because using GridLayout
            // without passing in a new layout doesn't trigger a re-render.
            layout.i = url;
            layouts.push(layout);
            components.push(
                <div key={url} className="spaces-component-view-wrapper">
                    <SpacesComponentView
                        url={url}
                        editable={props.editable}
                        getComponent={async () => model.handle.get()}
                        removeComponent={() => props.storage.removeItem(url)}
                    />
                </div>,
            );
        });

        return (
            <ReactGridLayout
                className="spaces-component-grid"
                cols={36}
                rowHeight={50}
                width={1800}
                height={10000}
                // eslint-disable-next-line no-null/no-null
                compactType={null} // null is required for the GridLayout
                isDroppable={props.editable}
                isDraggable={props.editable}
                isResizable={props.editable}
                preventCollision={true}
                isRearrangeable={false}
                onResizeStop={onGridChangeEvent}
                onDragStop={onGridChangeEvent}
                layout={layouts}
            >
                {components}
            </ReactGridLayout>
        );
    };

interface ISpacesViewProps {
    toolbarComponent: SpacesCompatibleToolbar | undefined;
    dataModel: ISpacesStorageModel;
    toolbarProps: IComponentSpacesToolbarProps;
}

export const SpacesView: React.FC<ISpacesViewProps> =
    (props: React.PropsWithChildren<ISpacesViewProps>) => {
        const [editable, setEditable] = React.useState<boolean>(props.dataModel.componentList.size === 0);

        // Editable is a view-only concept; SpacesView is the authority.
        const combinedToolbarProps = props.toolbarProps;
        combinedToolbarProps.editable = () => editable;
        combinedToolbarProps.setEditable = (isEditable?: boolean) => setEditable(isEditable ?? !editable);

        props.toolbarComponent?.setComponentProps(combinedToolbarProps);

        const toolbarElement = props.toolbarComponent !== undefined
            ? <ReactViewAdapter component={ props.toolbarComponent } />
            : undefined;

        return (
            <div className={`spaces-view${ editable ? " editable" : "" }`}>
                { toolbarElement }
                <SpacesStorageView storage={props.dataModel} editable={editable} />
            </div>
        );
    };
