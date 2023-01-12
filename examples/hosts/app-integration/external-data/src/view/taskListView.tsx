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
    const [draftTasks, setDiffTasks] = useState<ITask[]>(taskList.getDiffTasks());

    useEffect(() => {
        const updateTasks = (): void => {
            setTasks(taskList.getTasks());
        };
        const updateDiffTasks = (): void => {
            setDiffTasks(taskList.getDiffTasks());
        };
        taskList.on("taskAdded", updateTasks);
        taskList.on("taskDeleted", updateTasks);
        taskList.on("diffDetected", updateDiffTasks);

        setTasks(taskList.getTasks());
        setDiffTasks(taskList.getDiffTasks());

        // Run once immediately to run without waiting.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        taskList.importExternalData();

        return (): void => {
            taskList.off("taskAdded", updateTasks);
            taskList.off("taskDeleted", updateTasks);
            taskList.off("diffDetected", updateDiffTasks);
        }
    }, [taskList]);

    const taskRows = tasks.map((task: ITask) => (
        <TaskRow
            key={ task.id }
            task={ task }
            deleteTask={ (): void => taskList.deleteTask(task.id) }
        />
    ));

    const draftTaskRows = draftTasks.map((task) => (
        <TaskRow
            key={ task.id }
            task={ task }
            deleteTask={ (): void => taskList.deleteTask(task.id) }
        />
    ));

    const diffElementsArePresent = draftTasks.length === 0 ? 'hidden' : 'visible';
    return (
        // TODO: Gray button if not "authenticated" via debug controls
        // TODO: Conflict UI
        <div>
            <h2 style={{ textDecoration: "underline" }}>Client App</h2>
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
            <table style={{ visibility: diffElementsArePresent, backgroundColor: 'orange' }}>
                <thead>
                    <tr>
                        <td>ID</td>
                        <td>Title</td>
                        <td>Priority</td>
                    </tr>
                </thead>
                <tbody>
                    { draftTaskRows }
                </tbody>
            </table>
            <button onClick={ taskList.saveChanges }>Save changes</button>
        </div>
    );
};
