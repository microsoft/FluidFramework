/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";

import React, { useEffect, useRef, useState } from "react";

import type { ITask, ITaskList } from "../model-interface";

import { DEFAULT_DIFF_PRIORITY, DEFAULT_DIFF_NAME } from "../model-interface";

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
    const [savedName, setSavedName] =  useState<string>(task.diffName);
    const [savedPriority, setSavedPriority] = useState<number>(task.diffPriority);
    const [savedDiffType, setSavedDiffType] = useState<string>(task.diffType);
    useEffect(() => {
        const updateFromRemotePriority = (): void => {
            if (priorityRef.current !== null) {
                priorityRef.current.value = task.priority.toString();
            }
        };
        const showSavedPriority = (): void => {
            setSavedPriority(task.diffPriority);
            setSavedDiffType(task.diffType);
        }
        const showSavedName = (): void => {
            setSavedName(task.diffName);
            setSavedDiffType(task.diffType);
        }
        task.on("priorityChanged", updateFromRemotePriority);
        task.on("externalPriorityChanged", showSavedPriority);
        task.on("externalNameChanged", showSavedName);
        updateFromRemotePriority();
        return (): void => {
            task.off("priorityChanged", updateFromRemotePriority);
            task.off("externalPriorityChanged", showSavedPriority);
            task.off("externalNameChanged", showSavedName);
        };
    }, [task, savedName, savedPriority, savedDiffType]);

    const inputHandler = (e: React.FormEvent): void => {
        const newValue = Number.parseInt((e.target as HTMLInputElement).value, 10);
        task.priority = newValue;
    };

    const diffVisible = savedDiffType === "none";
    const showPriority = !diffVisible && savedPriority !== DEFAULT_DIFF_PRIORITY ? "visible" : "hidden";
    const showName = !diffVisible && savedName !== DEFAULT_DIFF_NAME ? "visible" : "hidden";
    const showAcceptButton = diffVisible ? "hidden" : "visible";

    let diffColor: string = "white";
    switch(savedDiffType) {
        case "add": {
           diffColor = "green";
           break;
        }
        case "delete": {
            diffColor = "red";
           break;
        }
        default: {
            diffColor = "orange";
           break;
        }
    }

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
            <td style={{ visibility: showName, backgroundColor: diffColor }}>{ savedName }</td>
            <td style={{ visibility: showPriority, backgroundColor: diffColor }}>{ savedPriority }</td>
            <td>
                <button
                    onClick={ task.acceptChange } style={{ visibility: showAcceptButton }}>Accept change</button>
            </td>
            <td>
                <button
                    onClick={ task.ignoreChange } style={{ visibility: showAcceptButton }}>Ignore change</button>
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

    const taskRows = tasks.map((task: ITask) => (
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
            <button onClick={ taskList.saveChanges }>Save changes</button>
        </div>
    );
};
