import React from "react";
import { TaskManager } from "@fluidframework/task-manager";

import sillyname from "sillyname";
import { AddCircle32Regular, CheckmarkRegular, DocumentRegular, EditRegular } from "@fluentui/react-icons";
import {
	TableBody,
	TableRow,
	Table,
	TableHeader,
	TableHeaderCell,
	TableCell,
	TableCellLayout,
} from "@fluentui/react-components";

/**
 * TODO
 */
export interface TaskManagerWidgetProps {
	taskManager: TaskManager;
}

/**
 * TODO
 */
export function TaskManagerWidget(props: TaskManagerWidgetProps): React.ReactElement {
	const { taskManager } = props;

	const defaultTaskId = "strawberry-fields" // default taskId shared across different clients 
	const [taskQueues, setTaskQueues] = React.useState<string[]>([defaultTaskId]);

	const addTask = async (): Promise<void> => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		const taskId = (sillyname() as unknown as string).toLowerCase().split(" ").join("-");

        setTaskQueues(prevQueues => [...prevQueues, taskId])
	};

	const addAuxTask = async (): Promise<void> => {
		const fixedId = "penny-lane"; 

        setTaskQueues(prevQueues => [...prevQueues, fixedId])
	};

	const columns = [
		{ columnKey: "task", label: "Task" },
		{ columnKey: "assigned", label: "Assigned" },
		{ columnKey: "queued", label: "Queued" },
		{ columnKey: "actions", label: "Actions" },
	];

	return (
		<>
			<Table size="small" aria-label="Task-Manager-Table">
				<TableHeader>
					<TableRow>
						{columns.map((column) => (
							<TableHeaderCell key={column.columnKey}>{column.label}</TableHeaderCell>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{
						[...taskQueues].map((taskId) => (
							<TaskRow key={taskId} taskManager={taskManager} taskId={taskId} />
						))
					}
				</TableBody>
			</Table>
			<AddCircle32Regular onClick={addTask} />
			<AddCircle32Regular onClick={addAuxTask} />
		</>
	);
}

interface TaskRowProps {
	taskManager: TaskManager;
	taskId: string;
}

function TaskRow(props: TaskRowProps): React.ReactElement {
	const { taskManager, taskId } = props;

	console.log(taskManager);
	
	const [assigned, setAssigned] = React.useState<boolean>(false);
	const [queued, setQueued] = React.useState<boolean>(false);
	const [subscribed, setSubscribed] = React.useState<boolean>(false);

	React.useEffect(() => {
	    const updateState = (): void => {
	        setAssigned(taskManager.assigned(taskId));
	        setQueued(taskManager.queued(taskId));
	        setSubscribed(taskManager.subscribed(taskId));
	    };

	    taskManager.on("assigned", updateState);
	    taskManager.on("lost", updateState);
	    taskManager.on("completed", updateState);

	    taskManager.subscribeToTask(taskId);

	    return (): void => {
	        taskManager.off("assigned", updateState);
	        taskManager.off("lost", updateState);
	        taskManager.off("completed", updateState);
	    };
	}, [taskManager, taskId]);

	const items = {
	    task: { label: taskId, icon: <DocumentRegular /> },
	    assigned: { label: assigned, icon: <CheckmarkRegular /> },
	    queued: { label: queued, status: <DocumentRegular /> },
	    actions: {
	        label: (
	            <ActionButtons
	                taskManager={taskManager}
	                taskManagerId={taskId}
	                assigned={assigned}
	                subscribed={subscribed}
	                queued={queued}
	            />
	        ),
	        icon: <EditRegular />,
	    },
	};

	return (
	    <TableRow key={items.task.label}>
	        <TableCell>
	            <TableCellLayout>{items.task.label}</TableCellLayout>
	        </TableCell>
	        <TableCell>
	            <TableCellLayout>{items.assigned.label ? "True" : "False"}</TableCellLayout>
	        </TableCell>
	        <TableCell>
	            <TableCellLayout>{items.queued.label ? "True" : "False"}</TableCellLayout>
	        </TableCell>
	        <TableCell>
	            <TableCellLayout>{items.actions.label}</TableCellLayout>
	        </TableCell>
	    </TableRow>
	);
}

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
