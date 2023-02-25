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
	const [incomingName, setIncomingName] = useState<string | undefined>(task.incomingName);
	const [incomingPriority, setIncomingPriority] = useState<number | undefined>(
		task.incomingPriority,
	);
	const [incomingType, setIncomingType] = useState<string | undefined>(task.incomingType);
	useEffect(() => {
		const updateFromRemotePriority = (): void => {
			if (priorityRef.current !== null) {
				priorityRef.current.value = task.priority.toString();
			}
		};
		const showIncomingPriority = (): void => {
			setIncomingPriority(task.incomingPriority);
			setIncomingType(task.incomingType);
		};
		const showIncomingName = (): void => {
			setIncomingName(task.incomingName);
			setIncomingType(task.incomingType);
		};
		task.on("priorityChanged", updateFromRemotePriority);
		task.on("incomingPriorityChanged", showIncomingPriority);
		task.on("incomingNameChanged", showIncomingName);
		updateFromRemotePriority();
		return (): void => {
			task.off("priorityChanged", updateFromRemotePriority);
			task.off("incomingPriorityChanged", showIncomingPriority);
			task.off("incomingNameChanged", showIncomingName);
		};
	}, [task, incomingName, incomingPriority, incomingType]);

	const inputHandler = (e: React.FormEvent): void => {
		const newValue = Number.parseInt((e.target as HTMLInputElement).value, 10);
		task.priority = newValue;
	};

	const diffVisible = incomingType === undefined;
	const showPriority = !diffVisible && incomingPriority !== undefined ? "visible" : "hidden";
	const showName = !diffVisible && incomingName !== undefined ? "visible" : "hidden";
	const showAcceptButton = diffVisible ? "hidden" : "visible";

	let diffColor: string = "white";
	switch (incomingType) {
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
			<td>{task.id}</td>
			<td>
				<CollaborativeInput
					sharedString={task.name}
					style={{ width: "200px" }}
				></CollaborativeInput>
			</td>
			<td>
				<input
					ref={priorityRef}
					onInput={inputHandler}
					type="number"
					style={{ width: "50px" }}
				></input>
			</td>
			<td>
				<button onClick={deleteTask} style={{ background: "none", border: "none" }}>
					❌
				</button>
			</td>
			<td style={{ visibility: showName, backgroundColor: diffColor }}>{incomingName}</td>
			<td style={{ visibility: showPriority, backgroundColor: diffColor }}>
				{incomingPriority}
			</td>
			<td>
				<button
					onClick={task.overwriteWithIncomingData}
					style={{ visibility: showAcceptButton }}
				>
					Accept change
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

	const taskRows = tasks.map((task: ITask) => (
		<TaskRow key={task.id} task={task} deleteTask={(): void => taskList.deleteTask(task.id)} />
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
				<tbody>{taskRows}</tbody>
			</table>
			<button onClick={taskList.saveChanges}>Save changes</button>
		</div>
	);
};
