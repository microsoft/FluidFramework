/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import { IInventoryListContainer, MigrationState } from "./interfaces";
import { InventoryListView } from "./inventoryView";

export interface IInventoryListContainerViewProps {
    model: IInventoryListContainer;
}

export const InventoryListContainerView: React.FC<IInventoryListContainerViewProps> =
    (props: IInventoryListContainerViewProps) => {
    const { model } = props;

    // TODO: Maybe move disable handling outside of the view?
    const [disableInput, setDisableInput] = useState<boolean>(
        model.getMigrationState() !== MigrationState.collaborating,
    );

    useEffect(() => {
        const migrationStateChangedHandler = () => {
            setDisableInput(model.getMigrationState() !== MigrationState.collaborating);
        };
        model.on("migrating", migrationStateChangedHandler);
        model.on("migrated", migrationStateChangedHandler);
        migrationStateChangedHandler();
        return () => {
            model.off("migrating", migrationStateChangedHandler);
            model.off("migrated", migrationStateChangedHandler);
        };
    }, [model]);

    return (
        <InventoryListView inventoryList={ model.inventoryList } disabled={ disableInput } />
    );
};
