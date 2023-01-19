/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { TestClient } from "./testClient";
import { trackProperties } from "./testUtils";

// Note: most of the attribution functionality isn't implemented directly on client. These tests are behavioral verifications
// for the attribution data stored on a single client's view over the course of a collaborative session. This is somewhat
// covered by larger integration tests such as snapshot verification (which is unlikely to succeed if the data before
// snapshotting is incorrect), but this suite is a reasonable balance of being easy to debug but authentic enough to catch
// op handling errors.

describe("Client attribution", () => {
    const localUserLongId = "localUser";
    const remoteUserLongId = "remoteUser";
    let client: TestClient;
    let seq: number = 0;
    beforeEach(() => {
        seq = 0;
    });

    describe("using the default interpreter", () => {
        beforeEach(() => {
            client = new TestClient({ attribution: { track: true } });
            client.startOrUpdateCollaboration(localUserLongId);
        });

        it("attributes segments inserted locally upon ack", () => {
            const mergeTreeOp = client.insertTextLocal(0, "123");
            assert.deepEqual(client.getAllAttributionSeqs(), [undefined, undefined, undefined]);
            client.applyMsg(client.makeOpMessage(mergeTreeOp, ++seq));
            assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, 1]);
        });

        it("attributes segments inserted remotely immediately", () => {
            client.insertTextRemote(0, "123", undefined, ++seq, seq - 1, remoteUserLongId);
            assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, 1]);
        });

        it("ignores local property changes", () => {
            client.applyMsg(client.makeOpMessage(client.insertTextLocal(0, "123"), ++seq));
            client.applyMsg(client.makeOpMessage(client.annotateRangeLocal(1, 2, { foo: 1 }, undefined), ++seq));
            client.applyMsg(client.makeOpMessage(client.annotateRangeLocal(0, 3, { bar: 2 }, undefined), ++seq));
            assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, 1]);            
        });

        it("ignores remote property changes", () => {
            client.insertTextRemote(0, "123", undefined, ++seq, seq - 1, remoteUserLongId);
            client.annotateRangeRemote(1, 2, { foo: 1 }, ++seq, seq - 1, remoteUserLongId);
            assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, 1]);   
        });
    });

    describe("using an interpreter which annotates only a specific property", () => {
        const channelName = 'fooProp';
        beforeEach(() => {
            client = new TestClient({
                attribution: {
                    track: true,
                    interpreter: trackProperties({ channelName, propName: 'foo' })
                } 
            });
            client.startOrUpdateCollaboration(localUserLongId);
        });

        it("ignores segments inserted locally", () => {
            const mergeTreeOp = client.insertTextLocal(0, "123");
            assert.deepEqual(client.getAllAttributionSeqs(channelName), [undefined, undefined, undefined]);
            client.applyMsg(client.makeOpMessage(mergeTreeOp, ++seq));
            assert.deepEqual(client.getAllAttributionSeqs(channelName), [undefined, undefined, undefined]);
        });

        it("ignores segments inserted remotely", () => {
            client.insertTextRemote(0, "123", undefined, ++seq, seq - 1, remoteUserLongId);
            assert.deepEqual(client.getAllAttributionSeqs(), [undefined, undefined, undefined]);
        });

        it("attributes local property change on ack", () => {
            client.applyMsg(client.makeOpMessage(client.insertTextLocal(0, "123"), ++seq));
            const annotateOp = client.annotateRangeLocal(1, 2, { foo: 1 }, undefined);
            assert.deepEqual(client.getAllAttributionSeqs(channelName), [undefined, undefined, undefined]);            
            client.applyMsg(client.makeOpMessage(annotateOp, ++seq));
            client.applyMsg(client.makeOpMessage(client.annotateRangeLocal(0, 3, { bar: 2 }, undefined), ++seq));
            assert.deepEqual(client.getAllAttributionSeqs(channelName), [undefined, 2, undefined]);            
        });

        it("attributes remote property changes", () => {
            client.insertTextRemote(0, "123", undefined, ++seq, seq - 1, remoteUserLongId);
            client.annotateRangeRemote(1, 2, { foo: 1 }, ++seq, seq - 1, remoteUserLongId);
            assert.deepEqual(client.getAllAttributionSeqs(channelName), [undefined, 2, undefined]);   
        });

        it("uses LWW semantics for conflicting attribution of props", () => {
            client.applyMsg(client.makeOpMessage(client.insertTextLocal(0, "123"), ++seq));
            const localPropChange = client.annotateRangeLocal(1, 2, { foo: 1 }, undefined);
            client.annotateRangeRemote(1, 2, { foo: 2 }, ++seq, seq - 1, remoteUserLongId);
            assert.equal(client.getPropertiesAtPosition(1)?.foo, 1);
            // Since the value of property "foo" is from a local change, the attribution information associated with
            // it should not be updated on account of the remote op.
            assert.deepEqual(client.getAllAttributionSeqs(channelName), [undefined, undefined, undefined]); // TODO: or [undefined, -1, undefined]
            client.applyMsg(client.makeOpMessage(localPropChange, ++seq, seq - 1, localUserLongId));
            assert.deepEqual(client.getAllAttributionSeqs(channelName), [undefined, seq, undefined]);
        });

        it("attributes properties set on a segment at insertion time", () => {
            client.insertTextRemote(0, "123", { foo: "bar" }, ++seq, seq - 1, remoteUserLongId);
            assert.deepEqual(client.getAllAttributionSeqs(channelName), [1, 1, 1]);
        })
    });

    describe("using an interpreter which annotates two properties", () => {
        const channelName1 = 'fooProp';
        const channelName2 = 'barProp';
        beforeEach(() => {
            client = new TestClient({
                attribution: {
                    track: true,
                    interpreter: trackProperties(
                        { channelName: channelName1, propName: 'foo' },
                        { channelName: channelName2, propName: 'bar' }
                    )
                } 
            });
            client.startOrUpdateCollaboration(localUserLongId);
        });

        it("attributes local property change on ack", () => {
            client.applyMsg(client.makeOpMessage(client.insertTextLocal(0, "123"), ++seq));
            client.applyMsg(client.makeOpMessage(client.annotateRangeLocal(1, 2, { foo: 1 }, undefined), ++seq));
            client.applyMsg(client.makeOpMessage(client.annotateRangeLocal(0, 3, { bar: 2 }, undefined), ++seq));
            assert.deepEqual(client.getAllAttributionSeqs(channelName1), [undefined, 2, undefined]);            ;
            assert.deepEqual(client.getAllAttributionSeqs(channelName2), [3, 3, 3]);            
        });
    });
});
