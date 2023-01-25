/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";
import isEqual from 'lodash.isequal'
import type { IAppModel, TaskData } from "../model-interface";
import { customerServicePort } from "../mock-service-interface";

/**
 * {@link DebugView} input props.
 */
export interface IDebugViewProps {
    /**
     * The Task List app model to be visualized.
     */
    model: IAppModel;
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
export const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
    const [unsynchronizedChangesCount, setUnsynchronizedChangesCount] = useState(0);
    const fluidSync = props.model.taskList.getSync();
    const unsyncExternalChangesUpdate = (count: number): void => {
        setUnsynchronizedChangesCount(count);
    }

    return (
        <div>
            <h2 style={{ textDecoration: "underline" }}>Debug info</h2>
            <ExternalDataView unsynchronizedChangesCount={unsynchronizedChangesCount} setUnsynchronizedChangesCount={setUnsynchronizedChangesCount} />
            <SyncStatusView
                fluidSync={fluidSync}
                unsynchronizedChangesCount={unsynchronizedChangesCount} handleCountUpdate={unsyncExternalChangesUpdate} />
            <ControlsView model={props.model} />
        </div>
    );
};


// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IExternalDataViewProps {
    unsynchronizedChangesCount: number;
    setUnsynchronizedChangesCount: (count: number) => void;
}

const ExternalDataView: React.FC<IExternalDataViewProps> = (props: IExternalDataViewProps) => {
    const [externalData, setExternalData] = useState<TaskData>({});
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
                if (newData !== undefined && !isEqual(newData, externalData)) {
                    console.log("APP: External data has changed. Updating local state with:\n", newData)
                    const updatedExternalData = Object.entries(newData);
                    let count = 0;
                    // eslint-disable-next-line unicorn/no-array-for-each
                    updatedExternalData.forEach(([id, { name, priority }]) => {
                        const existing = externalData[id] as {
                            name: string;
                            priority: number;
                        };
                        if (existing === undefined) {
                            count++;
                        } else if (existing.name !== name || existing.priority !== priority) {
                            count++;
                        }
                    });
                    props.setUnsynchronizedChangesCount(count)
                    setExternalData(newData);
                } else {
                    props.setUnsynchronizedChangesCount(0);
                }
            } catch (error) {
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
        : Object.entries(externalData);
    const taskRows = parsedExternalData.map(([key, { name, priority }]) => (
        <tr key={key}>
            <td>{key}</td>
            <td>{name}</td>
            <td>{priority}</td>
        </tr>
    ));

    return (
        <div>
            <h3>External Data:</h3>
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
                        {taskRows}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ISyncStatusViewProps {
    fluidSync: boolean;
    unsynchronizedChangesCount: number;
    handleCountUpdate: (count: number) => void;
}

// TODO: Implement the statuses below
const SyncStatusView: React.FC<ISyncStatusViewProps> = (props: ISyncStatusViewProps) => {
    useEffect(() => { }, [props.unsynchronizedChangesCount, props.fluidSync]);
    return (
        <div>
            <h3>Sync status</h3>
            <div style={{ margin: "10px 0" }}>
                Fluid has {props.fluidSync ? "some" : "no"} unsync'd changes.<br />
                External data source has {props.unsynchronizedChangesCount} unsync'd changes.<br />
                Current sync activity: [idle | fetching | writing | resolving conflicts?] (not implemented)<br />
            </div>
        </div>
    );
};

interface IControlsViewProps {
    model: IAppModel;
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
                <button onClick={debugResetExternalData}>Reset external data</button><br />
                <button onClick={props.model.debugSendCustomSignal}>Trigger external data change signal</button><br />
            </div>
        </div>
    );
};
