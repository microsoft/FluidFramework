/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Stores events during a call to {@link withBufferedTreeEvents}.
 *
 * @remarks
 * The system sends content events before derived events.
 * Thus, all listeners observe the final tree.
 */
export interface TreeEventBuffer {
	/** Sends events that report direct content changes. */
	flushContent?(): void;
	/** Sends events that report the final tree state. */
	flush(): void;
	/** Removes all pending events. */
	discard(): void;
}

/**
 * This value is true when the system buffers tree events.
 */
let bufferTreeEvents: boolean = false;

/**
 * Adds an event buffer to the active {@link withBufferedTreeEvents} call.
 *
 * @returns True if the function adds the buffer.
 */
export function bufferTreeEvent(buffer: TreeEventBuffer): boolean {
	if (!bufferTreeEvents) {
		return false;
	}
	activeBuffers.add(buffer);
	return true;
}

/**
 * Removes an event buffer from the active {@link withBufferedTreeEvents} call.
 */
export function removeTreeEventBuffer(buffer: TreeEventBuffer): void {
	activeBuffers.delete(buffer);
}

/**
 * Returns true if an event buffer is active.
 */
export function isTreeEventBufferActive(buffer: TreeEventBuffer): boolean {
	return activeBuffers.has(buffer);
}

/**
 * Runs a callback while the system buffers tree node events.
 *
 * @remarks
 * The system combines the buffered events.
 * It sends the events after the callback finishes.
 * Use this function with caution.
 * Application behavior can depend on event timing.
 */
export function withBufferedTreeEvents(callback: () => void): void {
	if (bufferTreeEvents) {
		callback();
		return;
	}

	bufferTreeEvents = true;
	try {
		callback();
	} catch (error) {
		bufferTreeEvents = false;
		for (const buffer of takeActiveBuffers()) {
			buffer.discard();
		}
		throw error;
	}

	bufferTreeEvents = false;
	flushTreeEventBuffers(takeActiveBuffers());
}

function takeActiveBuffers(): TreeEventBuffer[] {
	const buffers = [...activeBuffers];
	activeBuffers.clear();
	return buffers;
}

/**
 * Sends all buffered events.
 *
 * @remarks
 * An error from one listener does not stop other event buffers.
 * If listeners throw errors, this function throws the first error.
 * Some event buffers complete disposal after they send their events.
 */
function flushTreeEventBuffers(buffers: readonly TreeEventBuffer[]): void {
	const errors: unknown[] = [];
	for (const flush of [
		(buffer: TreeEventBuffer): void => buffer.flushContent?.(),
		(buffer: TreeEventBuffer): void => buffer.flush(),
	]) {
		for (const buffer of buffers) {
			try {
				flush(buffer);
			} catch (error) {
				errors.push(error);
			}
		}
	}
	if (errors.length > 0) {
		throw errors[0];
	}
}

/**
 * Contains event buffers that have pending events.
 *
 * @remarks
 * The set is empty when no call to {@link withBufferedTreeEvents} is active.
 */
const activeBuffers: Set<TreeEventBuffer> = new Set();

/**
 * Gets the number of active event buffers.
 *
 * @remarks
 * Use this function only in tests.
 */
export function getActiveBufferCountForTest(): number {
	return activeBuffers.size;
}
