/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import Collapsible from "react-collapsible";
import { DefaultButton as Button, initializeIcons } from "office-ui-fabric-react";
import { IDataObjectGridItemEntry } from "./dataObjectRegistry";
import "./toolbar.css";

initializeIcons();

interface IToolbarOption {
	/**
	 * Unique key for React
	 */
	key: string;
	create: () => void;
	friendlyName: string;
	fabricIconName: string;
}

interface IDataObjectGridToolbarAddItemPickerProps {
	toolbarOptions: IToolbarOption[];
}

const DataObjectGridToolbarAddItemPicker: React.FC<IDataObjectGridToolbarAddItemPickerProps> = (
	props: React.PropsWithChildren<IDataObjectGridToolbarAddItemPickerProps>,
) => {
	const { toolbarOptions } = props;
	const [open, setOpen] = React.useState<boolean>(false);

	const itemsButton = (
		<Button
			iconProps={{ iconName: open ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
			className="data-grid-toolbar-top-level-button"
			onClick={() => setOpen(!open)}
		>
			{"Add Items"}
		</Button>
	);
	const itemButtonList = toolbarOptions.map((toolbarOption) => (
		<Button
			className="data-grid-toolbar-option-button"
			key={`toolbarButton-${toolbarOption.key}`}
			iconProps={{ iconName: toolbarOption.fabricIconName }}
			onClick={() => {
				toolbarOption.create();
				setOpen(false);
			}}
		>
			{toolbarOption.friendlyName}
		</Button>
	));

	return (
		<Collapsible
			open={open}
			trigger={itemsButton}
			className="data-grid-toolbar-tool"
			openedClassName="data-grid-toolbar-tool"
		>
			{itemButtonList}
		</Collapsible>
	);
};

interface IDataObjectGridToolbarProps {
	editable: boolean;
	setEditable: (editable: boolean) => void;
	addItem: (type: string) => void;
	registry: Map<string, IDataObjectGridItemEntry>;
}

export const DataObjectGridToolbar: React.FC<IDataObjectGridToolbarProps> = (
	props: React.PropsWithChildren<IDataObjectGridToolbarProps>,
) => {
	const { editable, setEditable, addItem, registry } = props;

	const toolbarOptions: IToolbarOption[] = [...registry].map(([type, dataGridItemEntry]) => {
		return {
			key: type,
			create: () => addItem(type),
			friendlyName: dataGridItemEntry.friendlyName,
			fabricIconName: dataGridItemEntry.fabricIconName,
		};
	});

	return (
		<div className="data-grid-toolbar">
			<div key="edit" className="data-grid-toolbar-tool">
				<Button
					id="edit"
					className="data-grid-toolbar-top-level-button"
					iconProps={{ iconName: "BullseyeTargetEdit" }}
					onClick={() => {
						const newEditableState = !editable;
						setEditable(newEditableState);
					}}
				>
					{`Edit: ${editable}`}
				</Button>
			</div>
			<DataObjectGridToolbarAddItemPicker key="items" toolbarOptions={toolbarOptions} />
		</div>
	);
};
