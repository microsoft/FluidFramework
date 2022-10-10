/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import Collapsible from "react-collapsible";
import {
    DefaultButton as Button,
    initializeIcons,
} from "office-ui-fabric-react";
import {
    ISpacesItemEntry,
    IToolbarOption,
} from "./dataObjectRegistry";
import "./toolbar.css";

initializeIcons();

interface IDataObjectGridToolbarAddItemPickerProps {
    toolbarOptions: IToolbarOption[];
}

const DataObjectGridToolbarAddItemPicker: React.FC<IDataObjectGridToolbarAddItemPickerProps> =
    (props: React.PropsWithChildren<IDataObjectGridToolbarAddItemPickerProps>) => {
        const { toolbarOptions } = props;
        const [open, setOpen] = React.useState<boolean>(false);

        const itemsButton = (
            <Button
                iconProps={{ iconName: open ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                className="spaces-toolbar-top-level-button"
                onClick={() => setOpen(!open)}
            >
                {"Add Items"}
            </Button>
        );
        const itemButtonList = toolbarOptions.map(
            (toolbarOption) => (
                <Button
                    className="spaces-toolbar-option-button"
                    key={`toolbarButton-${toolbarOption.key}`}
                    iconProps={{ iconName: toolbarOption.fabricIconName }}
                    onClick={() => {
                        toolbarOption.create();
                        setOpen(false);
                    }}
                >
                    {toolbarOption.friendlyName}
                </Button>
            ),
        );

        return (
            <Collapsible
                open={open}
                trigger={itemsButton}
                className="spaces-toolbar-tool"
                openedClassName="spaces-toolbar-tool"
            >
                {itemButtonList}
            </Collapsible>
        );
    };

interface IDataObjectGridToolbarProps {
    editable: boolean;
    setEditable: (editable: boolean) => void;
    addItem: (type: string) => void;
    registry: Map<string, ISpacesItemEntry>;
}

export const DataObjectGridToolbar: React.FC<IDataObjectGridToolbarProps> =
    (props: React.PropsWithChildren<IDataObjectGridToolbarProps>) => {
        const { editable, setEditable, addItem, registry } = props;
        const toolbarItems: JSX.Element[] = [];

        const toolbarOptions: IToolbarOption[] = [...registry].map(([type, spacesItemEntry]) => {
            return {
                key: type,
                create: () => addItem(type),
                friendlyName: spacesItemEntry.friendlyName,
                fabricIconName: spacesItemEntry.fabricIconName,
            };
        });

        // Add the edit button
        toolbarItems.push(
            <div key="edit" className="spaces-toolbar-tool">
                <Button
                    id="edit"
                    className="spaces-toolbar-top-level-button"
                    iconProps={{ iconName: "BullseyeTargetEdit" }}
                    onClick={() => {
                        const newEditableState = !editable;
                        setEditable(newEditableState);
                    }}
                >
                    {`Edit: ${editable}`}
                </Button>
            </div>,
        );

        if (editable) {
            toolbarItems.push(
                <DataObjectGridToolbarAddItemPicker
                    key="items"
                    toolbarOptions={toolbarOptions}
                />,
            );
        }

        return (
            <div className="spaces-toolbar">
                {toolbarItems}
            </div>
        );
    };
