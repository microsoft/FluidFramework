/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";
import React from "react";
import RGL, { WidthProvider, Layout } from "react-grid-layout";
import { spacesItemMap } from "./dataObjectRegistry";
import { DataObjectGridToolbar } from "./toolbar";
import { IDataObjectGrid, IDataObjectGridStoredItem } from "./dataObjectGrid";

import "react-grid-layout/css/styles.css";
import "./dataObjectGridView.css";

const ReactGridLayout = WidthProvider(RGL);
interface ISpacesEditButtonProps {
    clickCallback(): void;
    title: string;
}

const SpacesEditButton: React.FC<ISpacesEditButtonProps> =
    (props: React.PropsWithChildren<ISpacesEditButtonProps>) =>
        <button
            className="spaces-edit-button"
            onClick={props.clickCallback}
            onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
            }}
            title={props.title}
        >
            {props.children}
        </button>;

interface ISpacesEditPaneProps {
    url: string;
    removeItem(): void;
}

const SpacesEditPane: React.FC<ISpacesEditPaneProps> =
    (props: React.PropsWithChildren<ISpacesEditPaneProps>) => {
        const { url, removeItem } = props;
        return (
            <div className="spaces-edit-pane">
                <SpacesEditButton title="Delete" clickCallback={removeItem}>❌</SpacesEditButton>
                <SpacesEditButton
                    title="Open in new window"
                    clickCallback={() => window.open(url, "_blank")}
                >↗️</SpacesEditButton>
            </div>
        );
    };

interface ISpacesItemViewProps {
    url: string;
    editable: boolean;
    getItemView(): Promise<JSX.Element | undefined>;
    removeItem(): void;
}

const SpacesItemView: React.FC<ISpacesItemViewProps> =
    (props: React.PropsWithChildren<ISpacesItemViewProps>) => {
        const [itemView, setItemView] = React.useState<JSX.Element | undefined>(undefined);

        React.useEffect(() => {
            props.getItemView()
                .then(setItemView)
                .catch((error) => console.error(`Error in getting item`, error));
        }, [props.getItemView]);

        return (
            <div className="spaces-item-view">
                {
                    props.editable &&
                    <SpacesEditPane url={props.url} removeItem={props.removeItem} />
                }
                <div className="spaces-embedded-item-wrapper">
                    {itemView}
                </div>
            </div>
        );
    };

// Stronger typing here maybe?
interface ISpacesStorageViewProps<T = any> {
    getViewForItem: (item: Serializable<T>) => Promise<JSX.Element | undefined>;
    getUrlForItem: (itemId: string) => string;
    model: IDataObjectGrid;
    editable: boolean;
}

export const SpacesStorageView: React.FC<ISpacesStorageViewProps> =
    (props: React.PropsWithChildren<ISpacesStorageViewProps>) => {
        // Again stronger typing would be good
        const [itemMap, setItemMap] =
            React.useState<Map<string, IDataObjectGridStoredItem<any>>>(props.model.getItems());

        React.useEffect(() => {
            const onItemListChanged = (newMap: Map<string, Layout>) => {
                setItemMap(newMap);
            };
            props.model.on("itemListChanged", onItemListChanged);
            return () => {
                props.model.off("itemListChanged", onItemListChanged);
            };
        });

        // Render nothing if there are no items
        if (props.model.getItems().size === 0) {
            return <></>;
        }

        const onGridChangeEvent = (
            layout: Layout[],
            oldItem: Layout,
            newItem: Layout,
            placeholder: Layout,
            event: MouseEvent,
            element: HTMLElement,
        ) => {
            const key = newItem.i.split("_")[0];
            props.model.updateLayout(key, newItem);
        };

        const itemViews: JSX.Element[] = [];
        const layouts: Layout[] = [];
        itemMap.forEach((item, itemId) => {
            const getItemView = async () => props.getViewForItem(item.serializableItemData);

            const layout = item.layout;
            // We use separate layout from array because using GridLayout
            // without passing in a new layout doesn't trigger a re-render.
            layout.i = itemId;
            layouts.push(layout);
            itemViews.push(
                <div key={itemId} className="spaces-item-view-wrapper">
                    <SpacesItemView
                        url={props.getUrlForItem(itemId)}
                        editable={props.editable}
                        getItemView={getItemView}
                        removeItem={() => props.model.removeItem(itemId)}
                    />
                </div>,
            );
        });

        return (
            <ReactGridLayout
                className={`spaces-storage-view${props.editable ? " editable" : ""}`}
                cols={36}
                rowHeight={50}
                width={1800}
                height={10000}
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
                {itemViews}
            </ReactGridLayout>
        );
    };

interface IDataObjectGridViewProps {
    readonly model: IDataObjectGrid;
    readonly getDirectUrl: (id: string) => string;
}

export const DataObjectGridView: React.FC<IDataObjectGridViewProps> = (props: IDataObjectGridViewProps) => {
    const { model, getDirectUrl } = props;
    const [editable, setEditable] = React.useState<boolean>(model.getItems().size === 0);
    return (
        <div className="spaces-view">
            <DataObjectGridToolbar
                editable={editable}
                setEditable={setEditable}
                itemMap={spacesItemMap}
                addItem={model.addItem}
            />
            <SpacesStorageView
                getViewForItem={model.getViewForItem}
                getUrlForItem={getDirectUrl}
                model={model}
                editable={editable}
            />
        </div>
    );
};
