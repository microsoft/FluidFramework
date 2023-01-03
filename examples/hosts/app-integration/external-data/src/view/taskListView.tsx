/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";

import React, { useEffect, useRef, useState } from "react";

import type { ITask, ITaskList } from "../model-interface";

interface ITaskRowProps {
    readonly task: ITask;
    readonly deleteTask: () => void;
}

/**
 * The view for a single task in the TaskListView, as a table row.
 */
const TaskRow: React.FC<ITaskRowProps> = (props: ITaskRowProps) => {
    const { task, deleteTask } = props;
    const priorityRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const updateFromRemotePriority = (): void => {
            if (priorityRef.current !== null) {
                priorityRef.current.value = task.priority.toString();
            }
        };
        task.on("priorityChanged", updateFromRemotePriority);
        updateFromRemotePriority();
        return (): void => {
            task.off("priorityChanged", updateFromRemotePriority);
        };
    }, [task]);

    const inputHandler = (e: React.FormEvent): void => {
        const newValue = Number.parseInt((e.target as HTMLInputElement).value, 10);
        task.priority = newValue;
    };

    return (
        <tr>
            <td>{ task.id }</td>
            <td>
                <CollaborativeInput
                    sharedString={ task.name }
                    style={{ width: "200px" }}
                ></CollaborativeInput>
            </td>
            <td>
                <input
                    ref={ priorityRef }
                    onInput={ inputHandler }
                    type="number"
                    style={{ width: "50px" }}
                ></input>
            </td>
            <td>
                <button
                    onClick={ deleteTask }
                    style={{ background: "none", border: "none" }}
                >
                    ❌
                </button>
            </td>
        </tr>
    );
};

/**
 * {@link TaskListView} input props.
 */
export interface ITaskListViewProps {
    readonly taskList: ITaskList;
}

/**
 * A tabular, editable view of the task list.  Includes a save button to sync the changes back to the data source.
 */
export const TaskListView: React.FC<ITaskListViewProps> = (props: ITaskListViewProps) => {
    const { taskList } = props;

    const [tasks, setTasks] = useState<ITask[]>(taskList.getTasks());
    useEffect(() => {
        const updateTasks = (): void => {
            setTasks(taskList.getTasks());
        };
        taskList.on("taskAdded", updateTasks);
        taskList.on("taskDeleted", updateTasks);

        return (): void => {
            taskList.off("taskAdded", updateTasks);
            taskList.off("taskDeleted", updateTasks);
        };
    }, [taskList]);

    const taskRows = tasks.map((task) => (
        <TaskRow
            key={ task.id }
            task={ task }
            deleteTask={ (): void => taskList.deleteTask(task.id) }
        />
    ));

    return (
        // TODO: Gray button if not "authenticated" via debug controls
        // TODO: Conflict UI
        <div>
            <table>
                <thead>
                    <tr>
                        <td>ID</td>
                        <td>Title</td>
                        <td>Priority</td>
                    </tr>
                </thead>
                <tbody>
                    { taskRows }
                </tbody>
            </table>
            <button onClick={ taskList.saveChanges }>Save changes</button>
        </div>
    );
};
