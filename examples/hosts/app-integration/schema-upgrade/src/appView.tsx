/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import { IInventoryListApp, MigrationState } from "./interfaces";
import { InventoryListView } from "./inventoryView";

export interface IAppViewProps {
    model: IInventoryListApp;
}

export const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
    const { model } = props;

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
