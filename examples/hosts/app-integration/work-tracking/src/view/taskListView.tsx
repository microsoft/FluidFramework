/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";

import React, { useEffect, useRef, useState } from "react";

import type { ITask, ITaskList } from "../modelInterfaces";

export interface ITaskViewProps {
    task: ITask;
    disabled?: boolean;
}

export const TaskView: React.FC<ITaskViewProps> = (props: ITaskViewProps) => {
    const { task, disabled } = props;
    const quantityRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const updateFromRemoteQuantity = () => {
            if (quantityRef.current !== null) {
                quantityRef.current.value = task.priority.toString();
            }
        };
        task.on("quantityChanged", updateFromRemoteQuantity);
        updateFromRemoteQuantity();
        return () => {
            task.off("quantityChanged", updateFromRemoteQuantity);
        };
    }, [task]);

    const inputHandler = (e) => {
        const newValue = parseInt(e.target.value, 10);
        task.priority = newValue;
    };

    return (
        <div>
            <CollaborativeInput
                sharedString={ task.name }
                style={{ width: "200px" }}
                disabled={ disabled }
            ></CollaborativeInput>
            <input
                ref={ quantityRef }
                onInput={ inputHandler }
                type="number"
                style={{ width: "50px" }}
                disabled={ disabled }
            ></input>
        </div>
    );
};

export interface ITaskListViewProps {
    inventoryList: ITaskList;
    disabled?: boolean;
}

export const TaskListView: React.FC<ITaskListViewProps> = (props: ITaskListViewProps) => {
    const { inventoryList, disabled } = props;

    const [inventoryItems, setInventoryItems] = useState<ITask[]>(inventoryList.getTasks());
    useEffect(() => {
        const updateItems = () => {
            setInventoryItems(inventoryList.getTasks());
        };
        inventoryList.on("itemAdded", updateItems);
        inventoryList.on("itemDeleted", updateItems);

        return () => {
            inventoryList.off("itemAdded", updateItems);
            inventoryList.off("itemDeleted", updateItems);
        };
    }, [inventoryList]);

    const inventoryItemViews = inventoryItems.map((inventoryItem) => (
        <TaskView key={ inventoryItem.id } task={ inventoryItem } disabled={ disabled } />
    ));

    return (
        <div style={{ textAlign: "center", whiteSpace: "nowrap" }}>
            { inventoryItemViews }
        </div>
    );
};
