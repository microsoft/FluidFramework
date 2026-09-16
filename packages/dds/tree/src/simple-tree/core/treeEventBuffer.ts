/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Stores events during a call to {@link withBufferedTreeEvents}.
 */
export interface TreeEventBuffer {
	/** Sends all pending events. */
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
 * @param flushAfterTreeNodeEvents - Set this for derived events that must observe all buffered
 * tree node events before they are sent.
 * @returns True if the function adds the buffer.
 */
export function bufferTreeEvent(
	buffer: TreeEventBuffer,
	flushAfterTreeNodeEvents: boolean = false,
): boolean {
	if (!bufferTreeEvents) {
		return false;
	}
	const buffers = flushAfterTreeNodeEvents ? derivedEventBuffers : treeNodeEventBuffers;
	buffers.add(buffer);
	return true;
}

/**
 * Removes an event buffer from the active {@link withBufferedTreeEvents} call.
 */
export function removeTreeEventBuffer(buffer: TreeEventBuffer): void {
	treeNodeEventBuffers.delete(buffer);
	derivedEventBuffers.delete(buffer);
}

/**
 * Returns true if an event buffer is active.
 */
export function isTreeEventBufferActive(buffer: TreeEventBuffer): boolean {
	return treeNodeEventBuffers.has(buffer) || derivedEventBuffers.has(buffer);
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
	for (const buffer of takeActiveBuffers()) {
		buffer.flush();
	}
}

function takeActiveBuffers(): TreeEventBuffer[] {
	const buffers = [...treeNodeEventBuffers, ...derivedEventBuffers];
	treeNodeEventBuffers.clear();
	derivedEventBuffers.clear();
	return buffers;
}

/**
 * Contains tree node event buffers that have pending events.
 *
 * @remarks
 * The set is empty when no call to {@link withBufferedTreeEvents} is active.
 */
const treeNodeEventBuffers: Set<TreeEventBuffer> = new Set();

/**
 * Contains derived event buffers that must flush after tree node events.
 *
 * @remarks
 * Parent location events can subscribe to tree node events. Flushing them last allows a parent
 * buffer to coalesce events produced while tree node buffers are flushed.
 */
const derivedEventBuffers: Set<TreeEventBuffer> = new Set();

/**
 * Gets the number of active event buffers.
 *
 * @remarks
 * Use this function only in tests.
 */
export function getActiveBufferCountForTest(): number {
	return treeNodeEventBuffers.size + derivedEventBuffers.size;
}
