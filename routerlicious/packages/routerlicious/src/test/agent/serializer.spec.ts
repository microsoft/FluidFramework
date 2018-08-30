import * as assert from "assert";
import * as agent from "../../agent";
import { MessageFactory, TestDocument } from "../testUtils";

describe("Routerlicious", () => {
    describe("Agent", () => {
        describe("Serializer", () => {
            const idleTime = 10;
            const maxTimeWithoutSnapshot = 20;
            const retryTime = 1;
            const MaxOpCountWithoutSnapshot = 100;
            const documentId = "test-document";
            const clientId = "test-client";

            let document: TestDocument;
            let serializer: agent.Serializer;
            let factory: MessageFactory;

            beforeEach(() => {
                factory = new MessageFactory(documentId, clientId);
                document = new TestDocument(documentId, clientId);
                serializer = new agent.Serializer(
                    document,
                    idleTime,
                    maxTimeWithoutSnapshot,
                    retryTime,
                    MaxOpCountWithoutSnapshot);
            });

            describe("run", () => {
                function waitForResume(): Promise<void> {
                    assert.equal(document.deltaManager.inbound.paused, true);
                    return document.deltaManager.inbound.waitForResume();
                }

                it("Should snapshot after receiving a save operation", async () => {
                    // Trigger a save
                    serializer.run(factory.createSave().operation);

                    // The snapshot will pause the queue - waiting for resume to know when op processing completed
                    await waitForResume();

                    // Verify we took a snapshot
                    assert.equal(document.snapshotRequests, 1);
                });

                it("Should retry snapshotting a save operation on error", async () => {
                    // Fail 3 times before resolving the promise
                    const totalRetries = 3;
                    let count = 0;
                    document.snapshotCore = (message: string) => {
                        count++;
                        return count === totalRetries ? Promise.resolve() : Promise.reject("test should fail");
                    };

                    // Trigger the save which will fail and wait for the resume - which will happen on success
                    serializer.run(factory.createSave().operation);
                    await waitForResume();

                    // Verify we took failureTimes snapshots + one for success
                    assert.equal(document.snapshotRequests, totalRetries);
                });

                it("Should snapshot on idle", () => {
                    serializer.run(factory.createSequencedOperation().operation);
                    return new Promise((resolve, reject) => {
                        setTimeout(
                            () => {
                                assert.equal(document.snapshotRequests, 1);
                                resolve();
                            },
                            1.5 * idleTime);
                    });
                });

                it("Should not retry after failed idle snapshot", () => {
                    let failureCount = 0;
                    document.snapshotCore = (message: string) => {
                        failureCount++;
                        return Promise.reject("test should fail");
                    };

                    // Send a single message - this should result in one failure message
                    serializer.run(factory.createSequencedOperation().operation);

                    return new Promise((resolve, reject) => {
                        setTimeout(
                            () => {
                                assert.equal(failureCount, 1);
                                resolve();
                            },
                            maxTimeWithoutSnapshot);
                    });
                });

                it("Should snapshot after max time without a snapshot has past", () => {
                    // Create new messages at half the idle interval to avoid idle snapshots
                    const messageInterval = setInterval(
                        () => {
                            serializer.run(factory.createSequencedOperation().operation);
                        },
                        idleTime / 2);

                    // Wait for the max idle time to pass and then validate the snapshots
                    return new Promise((resolve, reject) => {
                        setTimeout(
                            () => {
                                clearInterval(messageInterval);
                                assert.equal(document.snapshotRequests, 1);
                                resolve();
                            },
                            1.5 * maxTimeWithoutSnapshot);
                    });
                });
            });
        });
    });
});
