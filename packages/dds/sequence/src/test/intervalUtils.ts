/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockContainerRuntimeForReconnection } from "@fluidframework/test-runtime-utils";
import { SharedString } from "../sharedString";

export interface Client {
    sharedString: SharedString;
    containerRuntime: MockContainerRuntimeForReconnection;
}

/**
 * Validates that all shared strings in the provided array are consistent in the underlying text
 * and location of all intervals in any interval collections they have.
 * */
export function assertConsistent(clients: Client[]): void {
    const connectedClients = clients.filter((client) => client.containerRuntime.connected);
    if (connectedClients.length < 2) {
        // No two strings are expected to be consistent.
        return;
    }
    const first = connectedClients[0].sharedString;
    for (const { sharedString: other } of connectedClients.slice(1)) {
        assert.equal(first.getLength(), other.getLength());
        assert.equal(
            first.getText(),
            other.getText(),
            `Non-equal text between strings ${first.id} and ${other.id}.`,
        );
        const firstLabels = Array.from(first.getIntervalCollectionLabels()).sort();
        const otherLabels = Array.from(other.getIntervalCollectionLabels()).sort();
        assert.deepEqual(
            firstLabels,
            otherLabels,
            `Different interval collections found between ${first.id} and ${other.id}.`,
        );
        for (let i = 0; i < firstLabels.length; i++) {
            const collection1 = first.getIntervalCollection(firstLabels[i]);
            const collection2 = other.getIntervalCollection(otherLabels[i]);
            const intervals1 = Array.from(collection1);
            const intervals2 = Array.from(collection2);
            assert.equal(
                intervals1.length,
                intervals2.length,
                `Different number of intervals found in ${first.id} and ${other.id}` +
                ` at collection ${firstLabels[i]}`,
            );
            for (const interval of intervals1) {
                assert(interval);
                const intervalId = interval.getIntervalId();
                assert(intervalId);
                const otherInterval = collection2.getIntervalById(intervalId);
                assert(otherInterval);
                const firstStart = first.localReferencePositionToPosition(interval.start);
                const otherStart = other.localReferencePositionToPosition(otherInterval.start);
                assert.equal(firstStart, otherStart,
                    `Startpoints of interval ${intervalId} different:\n` +
                    `\tfull text:${first.getText()}\n` +
                    `\tclient ${first.id} char:${first.getText(firstStart, firstStart + 1)}\n` +
                    `\tclient ${other.id} char:${other.getText(otherStart, otherStart + 1)}`);
                const firstEnd = first.localReferencePositionToPosition(interval.end);
                const otherEnd = other.localReferencePositionToPosition(otherInterval.end);
                assert.equal(firstEnd, otherEnd,
                    `Endpoints of interval ${intervalId} different:\n` +
                    `\tfull text:${first.getText()}\n` +
                    `\tclient ${first.id} char:${first.getText(firstEnd, firstEnd + 1)}\n` +
                    `\tclient ${other.id} char:${other.getText(otherEnd, otherEnd + 1)}`);
                assert.equal(interval.intervalType, otherInterval.intervalType);
                assert.deepEqual(interval.properties, otherInterval.properties);
            }
        }
    }
}
