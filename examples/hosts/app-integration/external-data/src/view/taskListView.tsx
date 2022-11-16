/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";

import React, { useEffect, useRef, useState } from "react";

import type { ITask, ITaskList } from "../modelInterfaces";

interface ITaskRowProps {
    task: ITask;
    deleteTask: () => void;
    disabled?: boolean;
}

const TaskRow: React.FC<ITaskRowProps> = (props: ITaskRowProps) => {
    const { task, deleteTask, disabled } = props;
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
        <tr>
            <td>{ task.id }</td>
            <td>
                <CollaborativeInput
                    sharedString={ task.name }
                    style={{ width: "200px" }}
                    disabled={ disabled }
                ></CollaborativeInput>
            </td>
            <td>
                <input
                    ref={ priorityRef }
                    onInput={ inputHandler }
                    type="number"
                    style={{ width: "50px" }}
                    disabled={ disabled }
                ></input>
            </td>
            <td>
                <button
                    onClick={ deleteTask }
                    style={{ background: "none", border: "none" }}
                >❌</button>
            </td>
        </tr>
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

    const taskRows = tasks.map((task) => (
        <TaskRow
            key={ task.id }
            task={ task }
            deleteTask={ () => taskList.deleteTask(task.id) }
            disabled={ disabled }
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
