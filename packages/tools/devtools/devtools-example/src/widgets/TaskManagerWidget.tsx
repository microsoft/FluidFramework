/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
// import { ISharedMap } from "@fluidframework/map";
import { TaskManager } from "@fluidframework/task-manager";

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

	const abandon = (): void => taskManager.abandon(taskManagerId);
	const volunteer = async (): Promise<boolean> => taskManager.volunteerForTask(taskManagerId);
	const subscribe = (): void => taskManager.subscribeToTask(taskManagerId);
	const complete = (): void => taskManager.complete(taskManagerId);

	return (
		<div style={{ margin: "15px 0px 15px 0px" }}>
			<div className="task-manager-header">
				<strong>Task Manager Info</strong>
			</div>

			<div className="task-manager-body">
				<div>
					{assigned
						? "This Client is currently: Task Assignee"
						: "This Client is currently: Not Task Assignee"}
				</div>
				<div>Queued: {queued.toString()}</div>
				<div>Assigned: {assigned.toString()}</div>
				<div>Subscribed: {subscribed.toString()}</div>

				<div className="task-manager-controls" style={{ margin: "7px 0px 7px 0px" }}>
					<button disabled={!queued} onClick={abandon} className="debug-controls button">
						Abandon
					</button>
					<button disabled={queued} onClick={volunteer} className="debug-controls button">
						Volunteer
					</button>
					<button
						disabled={queued && subscribed}
						onClick={subscribe}
						className="debug-controls button"
					>
						Subscribe
					</button>
					<button
						disabled={!assigned}
						onClick={complete}
						className="debug-controls button"
					>
						Complete
					</button>
				</div>
			</div>
		</div>
	);
}
