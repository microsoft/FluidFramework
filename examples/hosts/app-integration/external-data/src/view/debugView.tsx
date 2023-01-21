/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";
import isEqual from 'lodash.isequal'
import type { TaskData } from "../model-interface";
import { customerServicePort  } from "../mock-service-interface";

/**
 * {@link DebugView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IDebugViewProps {
}

/**
 * "Debug" view of external data source.
 *
 * @remarks
 *
 * In a real scenario, we would not be looking at this data directly, instead only observing the local data (except
 * when resolving merge conflicts with changes to the external data).
 *
 * For the purposes of this test app, it is useful to be able to see both data sources side-by-side.
 */
export const DebugView: React.FC<IDebugViewProps> = () => {
    return (
        <div>
            <h2 style={{ textDecoration: "underline" }}>External Data Server App</h2>
            <TaskListView />
            <ExternalDataView />
            <SyncStatusView />
            <ControlsView />
        </div>
    );
};


// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IExternalDataViewProps {}

const ExternalDataView: React.FC<IExternalDataViewProps> = (props: IExternalDataViewProps) => {
    const [externalData, setExternalData] = useState({});
    useEffect(() => {
        // HACK: Once we have external changes triggering the appropriate Fluid signal, we can simply listen
        // for changes coming into the model that way.
        // For now, poll the external service directly for any updates and apply as needed.
        async function pollForServiceUpdates(): Promise<void> {
            try {
                const response = await fetch(
                    `http://localhost:${customerServicePort}/fetch-tasks`,
                    {
                        method: "GET",
                        headers: {
                            "Access-Control-Allow-Origin": "*",
                            "Content-Type": "application/json",
                        },
                    }
                );

                const responseBody = await response.json() as Record<string, unknown>;
                const newData = responseBody.taskList as TaskData;
                if(newData !== undefined && !isEqual(newData,externalData)) {
                    console.log("APP: External data has changed. Updating local state with:\n", newData)
                    setExternalData(newData);
                }
            } catch(error) {
                console.error(`APP: An error was encountered while polling external data:\n${error}`);
            }
        }

        // Run once immediately to run without waiting.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        pollForServiceUpdates();

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        const timer = setInterval(pollForServiceUpdates, 3000); // Poll every 3 seconds
        return (): void => {
            clearInterval(timer);
        }
    }, [externalData, setExternalData]);
    const parsedExternalData = isEqual(externalData, {})
        ? []
        : Object.entries(externalData as TaskData);
    const taskRows = parsedExternalData.map(([key, {name, priority}]) => (
        <tr key={ key }>
            <td>{ key }</td>
            <td>{ name }</td>
            <td>{ priority }</td>
        </tr>
    ));

    return (
        <div>
            <h3>External Data Server:</h3>
            <div style={{ margin: "10px 0" }}>
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
            </div>
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ISyncStatusViewProps { }

// TODO: Implement the statuses below
const SyncStatusView: React.FC<ISyncStatusViewProps> = (props: ISyncStatusViewProps) => {
    return (
        <div>
            {/* <h3>Sync status</h3>
            <div style={{ margin: "10px 0" }}>
                Fluid has [no] unsync'd changes (not implemented)<br />
                External data source has [no] unsync'd changes (not implemented)<br />
                Current sync activity: [idle | fetching | writing | resolving conflicts?] (not implemented)<br />
            </div> */}
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IControlsViewProps {
}

/**
 * Invoke service function to reset the external data source to its original contents.
 */
function debugResetExternalData(): void {
    console.log("APP (DEBUG): Resetting external data...")
    fetch(
        `http://localhost:${customerServicePort}/debug-reset-task-list`,
        {
            method: "POST",
            headers: {
                "Access-Control-Allow-Origin": "*",
            },
        }
    ).catch(error => {
        console.error(`APP: Encountered an error resetting external data:\n${error}`);
    })
}

// TODO: Implement simulation of an external data change.  Maybe include UI for the debug user to edit the data
// themselves (as if they were editing it outside of Fluid).
// TODO: Consider how we might simulate errors/failures here to play with retry and recovery.
const ControlsView: React.FC<IControlsViewProps> = (props: IControlsViewProps) => {
    return (
        <div>
            <h3>Debug controls</h3>
            <div style={{ margin: "10px 0" }}>
                <button onClick={ debugResetExternalData }>Reset external data</button><br />
            </div>
        </div>
    );
};


interface ITaskRowProps {
    task: ExternalDataTask
}

/**
 * The view for a single task in the TaskListView, as a table row.
 */
const TaskRow: React.FC<ITaskRowProps> = (props: ITaskRowProps) => {
    const { task } = props;

    const IdChangeHandler = (e: React.SyntheticEvent<HTMLInputElement>): void => {
        task.id = e.currentTarget.value;
    };
    const NameChangeHandler = (e: React.SyntheticEvent<HTMLInputElement>): void => {
        task.name = e.currentTarget.value;
    };
    const PriorityChangeHandler = (e: React.SyntheticEvent<HTMLInputElement>): void => {
        task.priority =  Number.parseInt(e.currentTarget.value, 10);
    };

    return (
        <tr>
            <td><input defaultValue={ task.id }  style={{ width: "30px" }} onChange={ IdChangeHandler }></input></td>
            <td><input defaultValue={ task.name } style={{ width: "200px" }} onChange={ NameChangeHandler }></input></td>
            <td><input defaultValue={ task.priority } type="number" style={{ width: "50px" }} onChange={ PriorityChangeHandler }></input></td>
        </tr>
    );
};

class ExternalDataTask {
    public id: string;
    public name: string;
    public priority: number;
    public constructor(id: string, name: string, priority: number) {
        this.id = id;
        this.name = name;
        this.priority = priority;
    }
}
/**
 * A tabular, editable view of the task list.  Includes a save button to sync the changes back to the data source.
 */
export const TaskListView: React.FC<IDebugViewProps> = () => {
    const [externalData, setExternalData] = useState({});
    useEffect(() => {
        // HACK: Once we have external changes triggering the appropriate Fluid signal, we can simply listen
        // for changes coming into the model that way.
        // For now, poll the external service directly for any updates and apply as needed.
        async function pollForServiceUpdates(): Promise<void> {
            try {
                const response = await fetch(
                    `http://localhost:${customerServicePort}/fetch-tasks`,
                    {
                        method: "GET",
                        headers: {
                            "Access-Control-Allow-Origin": "*",
                            "Content-Type": "application/json",
                        },
                    }
                );

                const responseBody = await response.json() as Record<string, unknown>;
                const newData = responseBody.taskList as TaskData;
                if(newData !== undefined && !isEqual(newData,externalData)) {
                    console.log("APP: External data has changed. Updating local state with:\n", newData)
                    setExternalData(newData);
                }
            } catch(error) {
                console.error(`APP: An error was encountered while polling external data:\n${error}`);
            }
        }

        // Run once immediately to run without waiting.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        pollForServiceUpdates();

        return (): void => {}
    }, [externalData, setExternalData]);
    const parsedExternalData = Object.entries(externalData as TaskData);
    const tasks: ExternalDataTask[] =  parsedExternalData.map(([key, {name, priority}]) => (
        new ExternalDataTask(key, name, priority)
    ));
    const taskRows = tasks.map((task: ExternalDataTask) => (
        <TaskRow key={task.id} task={ task } />
    ));
    const saveChanges = async (): Promise<void> => {
        // const taskStrings = tasks.map((task) => {
        //     return `${task.id}:${task.name}:${task.priority}`;
        // });
        // const stringDataToWrite = `${taskStrings.join("\n")}`;
        const formattedTasks = {}
        for (const task of tasks) {
            formattedTasks[task.id] = {
                name: task.name,
                priority: task.priority,
            };
        }
        try {
            await fetch(
                `http://localhost:${customerServicePort}/set-tasks`,
                {
                    method: 'POST',
                    headers: {
                        "Access-Control-Allow-Origin": "*",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ taskList: formattedTasks }),
                }
            );
        } catch (error) {
            console.error(`Task list submition failed due to an error:\n${error}`);

            // TODO: display error status to user?
        }
    }

    return (
        // TODO: Gray button if not "authenticated" via debug controls
        // TODO: Conflict UI
        <div>
            <h3>External Server App Form</h3>
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
            <button onClick={ saveChanges }>Save changes</button>
        </div>
    );
};
