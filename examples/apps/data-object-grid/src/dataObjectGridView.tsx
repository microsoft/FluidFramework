/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import RGL, { WidthProvider, Layout } from "react-grid-layout";

import { IDataObjectGrid, IDataObjectGridItem } from "./dataObjectGrid.js";
import { IDataObjectGridItemEntry, dataObjectRegistry } from "./dataObjectRegistry.js";
import { DataObjectGridToolbar } from "./toolbar.js";

// eslint-disable-next-line import/no-internal-modules
import "react-grid-layout/css/styles.css";
import "./dataObjectGridView.css";

const ReactGridLayout = WidthProvider(RGL);

interface IEditPaneProps {
	url: string;
	removeItem(): void;
}

const EditPane: React.FC<IEditPaneProps> = (
	props: React.PropsWithChildren<IEditPaneProps>,
) => {
	const { url, removeItem } = props;
	return (
		<div className="data-grid-edit-pane">
			<button className="data-grid-button" onClick={removeItem} title="Delete">
				❌
			</button>
			<button
				className="data-grid-button"
				onClick={() => window.open(url, "_blank")}
				title="Open in new window"
			>
				↗️
			</button>
		</div>
	);
};

interface IItemViewProps {
	url: string;
	getItemView(): Promise<JSX.Element | undefined>;
	removeItem(): void;
}

const ItemView: React.FC<IItemViewProps> = (
	props: React.PropsWithChildren<IItemViewProps>,
) => {
	const { url, getItemView, removeItem } = props;
	const [itemView, setItemView] = React.useState<JSX.Element | undefined>(undefined);

	React.useEffect(() => {
		getItemView()
			.then(setItemView)
			.catch((error) => console.error(`Error in getting item`, error));
	}, [getItemView]);

	return (
		<div className="data-grid-item-view">
			<div className="data-grid-embedded-item-wrapper">{itemView}</div>
			<EditPane url={url} removeItem={removeItem} />
		</div>
	);
};

// Stronger typing here maybe?
interface IDataObjectGridViewProps {
	getUrlForItem: (itemId: string) => string;
	model: IDataObjectGrid;
	registry: Map<string, IDataObjectGridItemEntry>;
	editable: boolean;
}

const DataObjectGridView: React.FC<IDataObjectGridViewProps> = (
	props: React.PropsWithChildren<IDataObjectGridViewProps>,
) => {
	const { getUrlForItem, model, registry, editable } = props;
	// Again stronger typing would be good
	const [itemList, setItemList] = React.useState<IDataObjectGridItem[]>(model.getItems());

	React.useEffect(() => {
		const onItemListChanged = (newList: IDataObjectGridItem[]) => {
			setItemList(newList);
		};
		model.on("itemListChanged", onItemListChanged);
		return () => {
			model.off("itemListChanged", onItemListChanged);
		};
	});

	// Render nothing if there are no items
	if (model.getItems().length === 0) {
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
		model.updateLayout(key, newItem);
	};

	const itemViews: JSX.Element[] = [];
	const layouts: Layout[] = [];
	itemList.forEach((item) => {
		const getItemView = async () => {
			const registryEntry = registry.get(item.type);

			if (registryEntry === undefined) {
				// Probably would be ok to return undefined instead
				throw new Error("Cannot get view, unknown widget type");
			}

			return registryEntry.getView(item.serializableData);
		};

		const layout = item.layout;
		// We use separate layout from array because using GridLayout
		// without passing in a new layout doesn't trigger a re-render.
		layout.i = item.id;
		layouts.push(layout);
		itemViews.push(
			<div key={item.id} className="data-grid-item-view-wrapper">
				<ItemView
					url={getUrlForItem(item.id)}
					getItemView={getItemView}
					removeItem={() => model.removeItem(item.id)}
				/>
			</div>,
		);
	});

	return (
		<ReactGridLayout
			className={`data-grid-view${editable ? " editable" : ""}`}
			cols={36}
			rowHeight={50}
			width={1800}
			height={10000}
			compactType={null} // null is required for the GridLayou t
			isDroppable={editable}
			isDraggable={editable}
			isResizable={editable}
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

/**
 * React props for our app's view.
 */
export interface IDataObjectGridAppViewProps {
	/**
	 * The app's model to render.
	 */
	readonly model: IDataObjectGrid;
	/**
	 * The view provides a button to direct link to each individual data object.  The host can specify the URL format
	 * that should be used for these direct links here (and should then also specifically load and render the
	 * requested data object in response to loading with that URL).
	 */
	readonly getDirectUrl: (id: string) => string;
}

/**
 * The main React view for the app.
 */
export const DataObjectGridAppView: React.FC<IDataObjectGridAppViewProps> = (
	props: IDataObjectGridAppViewProps,
) => {
	const { model, getDirectUrl } = props;
	const [editable, setEditable] = React.useState<boolean>(model.getItems().length === 0);
	return (
		<div className="data-grid-view">
			<DataObjectGridToolbar
				editable={editable}
				setEditable={setEditable}
				addItem={(type: string) => {
					model.addItem(type).catch(console.error);
				}}
				registry={dataObjectRegistry}
			/>
			<DataObjectGridView
				// TODO: Maybe can just pass in the views rather than making it go fetch
				getUrlForItem={getDirectUrl}
				model={model}
				registry={dataObjectRegistry}
				editable={editable}
			/>
		</div>
	);
};
