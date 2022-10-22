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
    const priorityRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const updateFromRemotePriority = () => {
            if (priorityRef.current !== null) {
                priorityRef.current.value = task.priority.toString();
            }
        };
        task.on("priorityChanged", updateFromRemotePriority);
        updateFromRemotePriority();
        return () => {
            task.off("priorityChanged", updateFromRemotePriority);
        };
    }, [task]);

    const inputHandler = (e) => {
        const newValue = parseInt(e.target.value, 10);
        task.priority = newValue;
    };

    return (
        <div>
            <span>{ task.id }: </span>
            <CollaborativeInput
                sharedString={ task.name }
                style={{ width: "200px" }}
                disabled={ disabled }
            ></CollaborativeInput>
            <input
                ref={ priorityRef }
                onInput={ inputHandler }
                type="number"
                style={{ width: "50px" }}
                disabled={ disabled }
            ></input>
        </div>
    );
};

export interface ITaskListViewProps {
    taskList: ITaskList;
    disabled?: boolean;
}

export const TaskListView: React.FC<ITaskListViewProps> = (props: ITaskListViewProps) => {
    const { taskList, disabled } = props;

    const [tasks, setTasks] = useState<ITask[]>(taskList.getTasks());
    useEffect(() => {
        const updateTasks = () => {
            setTasks(taskList.getTasks());
        };
        taskList.on("taskAdded", updateTasks);
        taskList.on("taskDeleted", updateTasks);

        return () => {
            taskList.off("taskAdded", updateTasks);
            taskList.off("taskDeleted", updateTasks);
        };
    }, [taskList]);

    const taskViews = tasks.map((task) => (
        <TaskView key={ task.id } task={ task } disabled={ disabled } />
    ));

    return (
        // TODO: Make this a table
        <div style={{ whiteSpace: "nowrap" }}>
            { taskViews }
        </div>
    );
};
