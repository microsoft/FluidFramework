/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import type { IAppModel } from "../modelInterfaces";
import { TaskListView } from "./taskListView";

export interface ITaskListAppViewProps {
    model: IAppModel;
}

/**
 * The InventoryListAppView is the top-level app view.  It is made to pair with an InventoryListAppModel and
 * render its contents appropriately.  Since container migration is a top-level concept, it takes the responsibility
 * of appropriately disabling the view during migration.  It would also be what triggers any other migration UI we
 * might want, progress wheels, etc.
 */
export const TaskListAppView: React.FC<ITaskListAppViewProps> =
    (props: ITaskListAppViewProps) => {
    const { model } = props;

    return (
        <TaskListView inventoryList={ model.inventoryList } />
    );
};
