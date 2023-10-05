/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import isEqual from "lodash.isequal";
import React, { useEffect, useState } from "react";

import { externalDataServicePort } from "../mock-external-data-service-interface";
import type { IAppModel, ITaskData } from "../model-interface";

// Hardcoding a taskListId here for now. In a real scenario this would be provided by the user when creating a task list component in the container.

const externalTaskListId = "task-list-1";
/**
 * Helper function used in several of the views to fetch data form the external app
 */
async function pollForServiceUpdates(
	externalData: Record<string, unknown>,
	setExternalData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
): Promise<void> {
	try {
		const response = await fetch(
			`http://localhost:${externalDataServicePort}/fetch-tasks/${externalTaskListId}`,
			{
				method: "GET",
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "application/json",
				},
			},
		);

		const responseBody = (await response.json()) as Record<string, unknown>;
		const newData = responseBody.taskList as ITaskData;
		if (newData !== undefined && !isEqual(newData, externalData)) {
			console.log("APP: External data has changed. Updating local state with:\n", newData);
			setExternalData(newData);
		}
	} catch (error) {
		console.error("APP: An error was encountered while polling external data:", error);
	}
}

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
			<ControlsView model={props.model} />
			<ExternalDataDebugView />
		</div>
	);
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IExternalDataDebugViewProps {}

const ExternalDataDebugView: React.FC<IExternalDataDebugViewProps> = (
	props: IExternalDataDebugViewProps,
) => {
	const [externalData, setExternalData] = useState({});
	useEffect(() => {
		// Run once immediately to run without waiting.
		pollForServiceUpdates(externalData, setExternalData).catch(console.error);

		// HACK: Poll every 3 seconds
		const timer = setInterval(() => {
			pollForServiceUpdates(externalData, setExternalData).catch(console.error);
		}, 3000);

		return (): void => {
			clearInterval(timer);
		};
	}, [externalData, setExternalData]);
	const parsedExternalData = isEqual(externalData, {})
		? []
		: Object.entries(externalData as ITaskData);
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
					<tbody>{taskRows}</tbody>
				</table>
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
	console.log("APP (DEBUG): Resetting external data...");
	fetch(`http://localhost:${externalDataServicePort}/debug-reset-task-list`, {
		method: "POST",
		headers: {
			"Access-Control-Allow-Origin": "*",
		},
	}).catch((error) => {
		console.error(`APP: Encountered an error resetting external data:\n${error}`);
	});
}

// TODO: Implement simulation of an external data change.  Maybe include UI for the debug user to edit the data
// themselves (as if they were editing it outside of Fluid).
// TODO: Consider how we might simulate errors/failures here to play with retry and recovery.
const ControlsView: React.FC<IControlsViewProps> = (props: IControlsViewProps) => {
	return (
		<div>
			<h2 style={{ textDecoration: "underline" }}>External Data Server App</h2>
			<ExternalServerTaskListView model={props.model} />
			<h3>Debug controls</h3>
			<div style={{ margin: "10px 0" }}>
				<button onClick={debugResetExternalData}>Reset external data</button>
				<br />
			</div>
		</div>
	);
};

interface IExternalServerTaskRowProps {
	task: ExternalServerDataTask;
}

/**
 * The view for a single task in the ExternalServerTaskListView, as a table row.
 */
const ExternalServerTaskRow: React.FC<IExternalServerTaskRowProps> = (
	props: IExternalServerTaskRowProps,
) => {
	const { task } = props;

	const idChangeHandler = (e: React.SyntheticEvent<HTMLInputElement>): void => {
		task.id = e.currentTarget.value;
	};
	const nameChangeHandler = (e: React.SyntheticEvent<HTMLInputElement>): void => {
		task.name = e.currentTarget.value;
	};
	const priorityChangeHandler = (e: React.SyntheticEvent<HTMLInputElement>): void => {
		task.priority = Number.parseInt(e.currentTarget.value, 10);
	};

	return (
		<tr>
			<td>
				<input
					defaultValue={task.id}
					style={{ width: "30px" }}
					onChange={idChangeHandler}
				></input>
			</td>
			<td>
				<input
					defaultValue={task.name}
					style={{ width: "200px" }}
					onChange={nameChangeHandler}
				></input>
			</td>
			<td>
				<input
					defaultValue={task.priority}
					type="number"
					style={{ width: "50px" }}
					onChange={priorityChangeHandler}
				></input>
			</td>
		</tr>
	);
};

interface ExternalServerTaskListViewProps {
	model: IAppModel;
}

/**
 * Model for external task data
 */
export interface ExternalServerDataTask {
	id: string;
	name: string;
	priority: number;
}

/**
 * A tabular, editable view of the task list.  Includes a save button to sync the changes back to the data source.
 */
export const ExternalServerTaskListView: React.FC<ExternalServerTaskListViewProps> = (
	props: ExternalServerTaskListViewProps,
) => {
	const { model } = props;
	const [externalData, setExternalData] = useState({});
	useEffect(() => {
		// HACK: Populate the external view form with the data in the external server to start off with
		pollForServiceUpdates(externalData, setExternalData).catch(console.error);

		return (): void => {};
	}, [externalData, setExternalData]);
	const parsedExternalData = Object.entries(externalData as ITaskData);
	const tasks = parsedExternalData.map(([id, { name, priority }]) => ({ id, name, priority }));
	const taskRows = tasks.map((task) => <ExternalServerTaskRow key={task.id} task={task} />);
	const writeToExternalServer = async (): Promise<void> => {
		const formattedTasks = {};
		for (const task of tasks) {
			formattedTasks[task.id] = {
				name: task.name,
				priority: task.priority,
			};
		}
		try {
			await fetch(
				`http://localhost:${externalDataServicePort}/set-tasks/${externalTaskListId}`,
				{
					method: "POST",
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ taskList: formattedTasks }),
				},
			);
		} catch (error) {
			console.error(`Task list submition failed due to an error:\n${error}`);

			// TODO: display error status to user?
		}
		// Send signal to simulate RuntimeSignal that will get sent from alfred in the dev branch
		model.sendCustomDebugSignal();
	};

	/* eslint-disable @typescript-eslint/no-misused-promises */
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
				<tbody>{taskRows}</tbody>
			</table>
			<button onClick={writeToExternalServer}>Save Changes</button>
		</div>
	);
	/* eslint-enable @typescript-eslint/no-misused-promises */
};
