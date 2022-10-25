/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import type { IAppModel } from "../modelInterfaces";
import { TaskListView } from "./taskListView";

export interface IAppViewProps {
    model: IAppModel;
}

/**
 * The AppView is the top-level app view.  It is made to pair with an AppModel and
 * render its contents appropriately.  Since container migration is a top-level concept, it takes the responsibility
 * of appropriately disabling the view during migration.  It would also be what triggers any other migration UI we
 * might want, progress wheels, etc.
 */
export const AppView: React.FC<IAppViewProps> =
    (props: IAppViewProps) => {
    const { model } = props;

    return (
        <TaskListView taskList={ model.taskList } />
    );
};
