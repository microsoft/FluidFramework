/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

interface TaskQueueItem {
	/** The task to run */
	task: () => void;
}

// A set of tasks that still have to be run
let taskQueue: TaskQueueItem[] = [];

// Set to true when we have a pending idle task scheduled
let idleTaskScheduled = false;

/**
 * A function that schedules a non critical task to be run when the browser has cycles available
 * @param task - The task to be executed
 * @param options - Optional configuration for the task execution
 */
export function scheduleIdleTask(task: () => void) {
	taskQueue.push({
		task,
	});

	ensureIdleCallback(2000);
}

/**
 * Ensures an idle callback has been scheduled for the remaining tasks
 */
function ensureIdleCallback(timeout: number = 0) {
	if (!idleTaskScheduled) {
		// Exception added when eslint rule was added, this should be revisited when modifying this code
		if (self.requestIdleCallback) {
			self.requestIdleCallback(idleTaskCallback);
		} else {
			const deadline = Date.now() + 50;
			self.setTimeout(
				() =>
					idleTaskCallback({
						timeRemaining: () => Math.max(deadline - Date.now(), 0),
						didTimeout: false,
					}),
				timeout,
			);
		}
		idleTaskScheduled = true;
	}
}

/**
 * Runs tasks from the task queue
 * @param filter - An optional function that will be called for each task to see if it should run.
 * Returns false for tasks that should not run. If omitted all tasks run.
 * @param shouldContinueRunning - An optional function that will be called to determine if
 * we have enough time to continue running tasks. If omitted, we don't stop running tasks.
 */
function runTasks(
	filter?: (taskQueueItem: TaskQueueItem) => boolean,
	shouldContinueRunning?: () => boolean,
) {
	// The next value for the task queue
	const newTaskQueue: TaskQueueItem[] = [];

	for (const [index, taskQueueItem] of taskQueue.entries()) {
		if (shouldContinueRunning && !shouldContinueRunning()) {
			// Add the tasks we didn't get to to the end of the new task queue
			newTaskQueue.push(...taskQueue.slice(index));
			break;
		}

		if (filter && !filter(taskQueueItem)) {
			newTaskQueue.push(taskQueueItem);
		} else {
			taskQueueItem.task();
		}
	}

	taskQueue = newTaskQueue;
}

// Runs all the tasks in the task queue
function idleTaskCallback(deadline: {
	timeRemaining: () => number;
	readonly didTimeout: boolean;
}) {
	// Minimum time that must be available on deadline to run any more tasks
	const minTaskTime = 10;
	runTasks(undefined, () => deadline.timeRemaining() > minTaskTime);
	idleTaskScheduled = false;

	// If we didn't run through the entire queue, schedule another idle callback
	if (taskQueue.length > 0) {
		ensureIdleCallback();
	}
}
