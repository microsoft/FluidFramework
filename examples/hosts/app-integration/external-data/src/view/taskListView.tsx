/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";

import React, { useEffect, useRef, useState } from "react";

import type { ITask, ITaskList } from "../model-interface";

interface ITaskRowProps {
	readonly task: ITask;
	readonly deleteDraftTask: () => void;
}

/**
 * The view for a single task in the TaskListView, as a table row.
 */
const TaskRow: React.FC<ITaskRowProps> = (props: ITaskRowProps) => {
	const { task, deleteDraftTask } = props;
	const priorityRef = useRef<HTMLInputElement>(null);
	const [externalName, setSourceName] = useState<string | undefined>(task.externalName);
	const [externalPriority, setSourcePriority] = useState<number | undefined>(task.externalPriority);
	const [changeType, setChangeType] = useState<string | undefined>(task.changeType);
	const [showConflictUI, setShowConflictUI] = useState<boolean>(false);
	useEffect(() => {
		const updateFromRemotePriority = (): void => {
			if (priorityRef.current !== null) {
				priorityRef.current.value = task.draftPriority.toString();
			}
		};
		const updateExternalPriority = (): void => {
			setSourcePriority(task.externalPriority);
			setChangeType(task.changeType);
		};
		const updateExternalName = (): void => {
			setSourceName(task.externalName);
			setChangeType(task.changeType);
		};
		const updateShowConflictUI = (value: boolean): void => {
			setShowConflictUI(value);
		};
		task.on("draftPriorityChanged", updateFromRemotePriority);
		task.on("externalPriorityChanged", updateExternalPriority);
		task.on("externalNameChanged", updateExternalName);
		task.on("changesAvailable", updateShowConflictUI);
		updateFromRemotePriority();
		return (): void => {
			task.off("draftPriorityChanged", updateFromRemotePriority);
			task.off("externalPriorityChanged", updateExternalPriority);
			task.off("externalNameChanged", updateExternalName);
			task.off("changesAvailable", updateShowConflictUI);
		};
	}, [task, priorityRef]);

	const inputHandler = (e: React.FormEvent): void => {
		const newValue = Number.parseInt((e.target as HTMLInputElement).value, 10);
		task.draftPriority = newValue;
	};

	const showPriorityDiff =
		showConflictUI &&
		task.externalPriority !== undefined &&
		task.externalPriority !== task.draftPriority;
	const showNameDiff =
		showConflictUI && task.externalName !== undefined && task.externalName !== task.draftName.getText();
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
					sharedString={task.draftName}
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
				<button onClick={deleteDraftTask} style={{ background: "none", border: "none" }}>
					❌
				</button>
			</td>
			{showNameDiff && <td style={{ backgroundColor: diffColor }}>{externalName}</td>}
			{showPriorityDiff && (
				<td style={{ backgroundColor: diffColor, width: "30px" }}>{externalPriority}</td>
			)}
			<td>
				<button
					onClick={task.overwriteWithExternalData}
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

	const [tasks, setTasks] = useState<ITask[]>(taskList.getDraftTasks());
	useEffect(() => {
		const updateTasks = (): void => {
			setTasks(taskList.getDraftTasks());
		};
		taskList.on("draftTaskAdded", updateTasks);
		taskList.on("draftTaskDeleted", updateTasks);

		return (): void => {
			taskList.off("draftTaskAdded", updateTasks);
			taskList.off("draftTaskDeleted", updateTasks);
		};
	}, [taskList]);

	const taskRows = tasks.map((task: ITask) => (
		<TaskRow key={task.id} task={task} deleteDraftTask={(): void => taskList.deleteDraftTask(task.id)} />
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
