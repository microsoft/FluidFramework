/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import type { IInventoryListAppModel } from "../modelInterfaces";
import { InventoryListView } from "./inventoryView";

export interface IInventoryListAppViewProps {
    model: IInventoryListAppModel;
}

/**
 * The InventoryListAppView is the top-level app view.  It is made to pair with an InventoryListAppModel and
 * render its contents appropriately.  Since container migration is a top-level concept, it takes the responsibility
 * of appropriately disabling the view during migration.  It would also be what triggers any other migration UI we
 * might want, progress wheels, etc.
 */
export const InventoryListAppView: React.FC<IInventoryListAppViewProps> =
    (props: IInventoryListAppViewProps) => {
    const { model } = props;

    const [disableInput, setDisableInput] = useState<boolean>(
        model.migrationTool.migrationState !== "collaborating",
    );

    useEffect(() => {
        const migrationStateChangedHandler = () => {
            setDisableInput(model.migrationTool.migrationState !== "collaborating");
        };
        model.migrationTool.on("stopping", migrationStateChangedHandler);
        model.migrationTool.on("migrating", migrationStateChangedHandler);
        model.migrationTool.on("migrated", migrationStateChangedHandler);
        migrationStateChangedHandler();
        return () => {
            model.migrationTool.off("stopping", migrationStateChangedHandler);
            model.migrationTool.off("migrating", migrationStateChangedHandler);
            model.migrationTool.off("migrated", migrationStateChangedHandler);
        };
    }, [model]);

    return (
        <InventoryListView inventoryList={ model.inventoryList } disabled={ disableInput } />
    );
};
