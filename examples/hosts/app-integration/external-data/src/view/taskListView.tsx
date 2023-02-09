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
	const [sourceName, setSourceName] = useState<string | undefined>(task.sourceName);
	const [sourcePriority, setSourcePriority] = useState<number | undefined>(task.sourcePriority);
	const [changeType, setChangeType] = useState<string | undefined>(task.changeType);
	const [showConflictUI, setShowConflictUI] = useState<boolean>(false);
	useEffect(() => {
		const updateFromRemotePriority = (): void => {
			if (priorityRef.current !== null) {
				priorityRef.current.value = task.priority.toString();
			}
		};
		const updateSourcePriority = (): void => {
			setSourcePriority(task.sourcePriority);
			setChangeType(task.changeType);
		};
		const updateSourceName = (): void => {
			setSourceName(task.sourceName);
			setChangeType(task.changeType);
		};
		const updateShowConflictUI = (value: boolean): void => {
			setShowConflictUI(value);
		};
		task.on("priorityChanged", updateFromRemotePriority);
		task.on("sourcePriorityChanged", updateSourcePriority);
		task.on("sourceNameChanged", updateSourceName);
		task.on("changesAvailable", updateShowConflictUI);
		updateFromRemotePriority();
		return (): void => {
			task.off("priorityChanged", updateFromRemotePriority);
			task.off("sourcePriorityChanged", updateSourcePriority);
			task.off("sourceNameChanged", updateSourceName);
			task.off("changesAvailable", updateShowConflictUI);
		};
	}, [task, priorityRef]);

	const inputHandler = (e: React.FormEvent): void => {
		const newValue = Number.parseInt((e.target as HTMLInputElement).value, 10);
		task.priority = newValue;
	};

	const showPriorityDiff =
		showConflictUI &&
		task.sourcePriority !== undefined &&
		task.sourcePriority !== task.priority;
	const showNameDiff =
		showConflictUI && task.sourceName !== undefined && task.sourceName !== task.name.getText();
	const showAcceptButton = showConflictUI ? "visible" : "hidden";

	let diffColor: string = "white";
	switch (changeType) {
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
			{showNameDiff && <td style={{ backgroundColor: diffColor }}>{sourceName}</td>}
			{showPriorityDiff && (
				<td style={{ backgroundColor: diffColor, width: "30px" }}>{sourcePriority}</td>
			)}
			<td>
				<button
					onClick={task.overwriteWithSourceData}
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
			<button onClick={taskList.writeToExternalServer}>Write to External Source</button>
		</div>
	);
};
