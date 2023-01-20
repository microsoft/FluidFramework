/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import type { IAppModel } from "../model-interface";
import { customerServicePort, parseStringData } from "../mock-service-interface";

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
    return (
        <div>
            <h2 style={{ textDecoration: "underline" }}>Debug info</h2>
            <ExternalDataView />
            <SyncStatusView />
            <ControlsView model={ props.model }/>
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IExternalDataViewProps {}

const ExternalDataView: React.FC<IExternalDataViewProps> = (props: IExternalDataViewProps) => {
    const [externalData, setExternalData] = useState<string | undefined>();
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

                const newData = responseBody.taskList as string;
                if(newData !== undefined && newData !== externalData) {
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

    const parsedExternalData = externalData === undefined
        ? []
        : parseStringData(externalData);

    console.log(parsedExternalData);
    const taskRows = parsedExternalData.map(({ id, name, priority }) => (
        <tr key={ id }>
            <td>{ id }</td>
            <td>{ name }</td>
            <td>{ priority }</td>
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
            <h3>Sync status</h3>
            <div style={{ margin: "10px 0" }}>
                Fluid has [no] unsync'd changes (not implemented)<br />
                External data source has [no] unsync'd changes (not implemented)<br />
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
                <button onClick={ debugResetExternalData }>Reset external data</button><br />
                <button onClick={ props.model.debugSendCustomSignal }>Trigger external data change signal</button><br />
            </div>
        </div>
    );
};
