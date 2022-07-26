/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import { IInventoryListContainer } from "../modelInterfaces";
import { MigrationState } from "../migrationInterfaces";
import { InventoryListView } from "./inventoryView";

export interface IInventoryListContainerViewProps {
    model: IInventoryListContainer;
}

/**
 * The InventoryListContainerView is the top-level app view.  It is made to pair with an InventoryListContainer and
 * render its contents appropriately.  Since container migration is a top-level concept, it takes the responsibility
 * of appropriately disabling the view during migration.  It would also be what triggers any other migration UI we
 * might want, progress wheels, etc.
 */
export const InventoryListContainerView: React.FC<IInventoryListContainerViewProps> =
    (props: IInventoryListContainerViewProps) => {
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
