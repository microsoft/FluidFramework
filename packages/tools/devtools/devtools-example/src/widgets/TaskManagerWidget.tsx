/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import sillyname from "sillyname";
import { TaskManager } from "@fluidframework/task-manager";
import { EditRegular, DocumentRegular, CheckmarkRegular } from "@fluentui/react-icons";
import {
	TableBody,
	TableCell,
	TableRow,
	Table,
	TableHeader,
	TableHeaderCell,
	TableCellLayout,
} from "@fluentui/react-components";

/**
 * {@link TaskManagerWidget} input props.
 */
export interface TaskManagerWidgetProps {
	taskManager: TaskManager;
}

/**
 * Simple TaskManager Widget.
 * Queues the request to a task by the order it was received.
 */
export function TaskManagerWidget(props: TaskManagerWidgetProps): React.ReactElement {
	const { taskManager } = props;

	const taskManagerId = "taskmManagerWidget-Id";

	const [assigned, setAssigned] = React.useState<boolean>(false);
	const [queued, setQueued] = React.useState<boolean>(false);
	const [subscribed, setSubscribed] = React.useState<boolean>(false);

	React.useEffect(() => {
		if (taskManager !== undefined) {
			const updateState = (): void => {
				setAssigned(taskManager.assigned(taskManagerId));
				setQueued(taskManager.queued(taskManagerId));
				setSubscribed(taskManager.subscribed(taskManagerId));
			};

			taskManager.on("assigned", updateState);
			taskManager.on("lost", updateState);
			taskManager.on("completed", updateState);

			taskManager.subscribeToTask(taskManagerId);

			return (): void => {
				taskManager.off("assigned", updateState);
				taskManager.off("lost", updateState);
				taskManager.off("completed", updateState);
			};
		}
	}, [taskManager]);

	if (taskManager === undefined) return <div />;

	// eslint-disable-next-line @typescript-eslint/no-unsafe-call
	const taskLabel = (sillyname() as unknown as string).toLowerCase().split(" ").join("-");

	const items = [
		{
			task: { label: taskLabel, icon: <DocumentRegular /> },
			assigned: { label: assigned, icon: <CheckmarkRegular /> },
			queued: { label: queued, status: <DocumentRegular /> },
			actions: {
				label: (
					<ActionButtons
						taskManager={taskManager}
						taskManagerId={taskManagerId}
						assigned={assigned}
						subscribed={subscribed}
						queued={queued}
					/>
				),
				icon: <EditRegular />,
			},
		},
	];

	const columns = [
		{ columnKey: "task", label: "Task" },
		{ columnKey: "assigned", label: "Assigned" },
		{ columnKey: "queued", label: "Queued" },
		{ columnKey: "actions", label: "Actions" },
	];

	return (
		<Table size="small" aria-label="Task-Manager-Table">
			<TableHeader>
				<TableRow>
					{columns.map((column) => (
						<TableHeaderCell key={column.columnKey}>{column.label}</TableHeaderCell>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{items.map((item) => (
					<TableRow key={item.task.label}>
						<TableCell>
							<TableCellLayout>{item.task.label}</TableCellLayout>
						</TableCell>
						<TableCell>
							<TableCellLayout>
								{item.assigned.label ? "True" : "False"}
							</TableCellLayout>
						</TableCell>
						<TableCell>
							<TableCellLayout>
								{item.queued.label ? "True" : "False"}
							</TableCellLayout>
						</TableCell>
						<TableCell>
							<TableCellLayout>{item.actions.label}</TableCellLayout>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

/**
 * TODO
 */
interface ActionButtonsProps {
	taskManager: TaskManager;
	taskManagerId: string;
	assigned: boolean;
	subscribed: boolean;
	queued: boolean;
}

function ActionButtons(props: ActionButtonsProps): React.ReactElement {
	const { taskManager, taskManagerId, assigned, subscribed, queued } = props;

	const abandon = (): void => taskManager.abandon(taskManagerId);
	const volunteer = async (): Promise<boolean> => taskManager.volunteerForTask(taskManagerId);
	const subscribe = (): void => taskManager.subscribeToTask(taskManagerId);
	const complete = (): void => taskManager.complete(taskManagerId);

	return (
		<div className="task-manager-controls" style={{ margin: "7px 0px 7px 0px" }}>
			<button disabled={!queued} onClick={abandon}>
				Abandon
			</button>
			<button disabled={queued} onClick={volunteer}>
				Volunteer
			</button>
			<button disabled={queued && subscribed} onClick={subscribe}>
				Subscribe
			</button>
			<button disabled={!assigned} onClick={complete}>
				Complete
			</button>
		</div>
	);
}
