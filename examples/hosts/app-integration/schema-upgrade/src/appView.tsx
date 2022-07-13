/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import { IApp, MigrationState } from "./interfaces";
import { InventoryListView } from "./inventoryView";

export interface IAppViewProps {
    app: IApp;
}

export const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
    const { app } = props;

    const [disableInput, setDisableInput] = useState<boolean>(app.getMigrationState() !== MigrationState.collaborating);

    useEffect(() => {
        const migrationStateChangedHandler = () => {
            setDisableInput(app.getMigrationState() !== MigrationState.collaborating);
        };
        app.on("migrationStateChanged", migrationStateChangedHandler);
        migrationStateChangedHandler();
        return () => {
            app.off("migrationStateChanged", migrationStateChangedHandler);
        };
    }, [app]);

    return (
        <InventoryListView inventoryList={ app.inventoryList } disabled={ disableInput } />
    );
};
