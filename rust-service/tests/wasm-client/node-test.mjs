import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { InjectedClient } = require("./pkg/fluid_webtransport_browser.js");
const encoder = new TextEncoder();

function concat(...parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
    }
    return bytes;
}

function u32(value) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value);
    return bytes;
}

function u64(value) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, BigInt(value));
    return bytes;
}

function field(value) {
    const bytes = encoder.encode(value);
    return concat(u32(bytes.length), bytes);
}

function frame(requestId, kind, ...body) {
    const payload = concat(...body);
    return concat(
        encoder.encode("FSP4"),
        new Uint8Array([0, 1, kind, 0]),
        u64(requestId),
        u32(payload.length),
        payload,
    );
}

function createRequest(requestId = 1) {
    return frame(requestId, 1, field("node-document"));
}

function acknowledged(requestId = 1) {
    return frame(requestId, 64, new Uint8Array([1]));
}

test("actual WASM validates requests and responses around the injected transport", async () => {
    const observed = [];
    const client = new InjectedClient({
        async request(request) {
            observed.push(request.slice());
            return acknowledged(7);
        },
    }, 1024);

    const request = createRequest(7);
    const response = await client.request(request);
    assert.deepEqual(observed, [request]);
    assert.deepEqual(response, acknowledged(7));
    assert.equal(client.state, "connected");
    assert.equal(client.wireBytes, BigInt(request.length + response.length));
    assert.equal(client.peakResponseBytes, response.length);
});

test("WASM rejects malformed and oversized frames before or after transport", async () => {
    let calls = 0;
    const malformedClient = new InjectedClient({
        async request() {
            calls++;
            return new Uint8Array();
        },
    }, 64);
    await assert.rejects(malformedClient.request(new Uint8Array([1, 2, 3])), /frame is truncated/);
    assert.equal(calls, 0);

    const malformedResponse = new InjectedClient({
        async request() {
            return new Uint8Array([1, 2, 3]);
        },
    }, 64);
    await assert.rejects(malformedResponse.request(createRequest()), /frame is truncated/);

    const oversizedResponse = new InjectedClient({
        async request() {
            return new Uint8Array(65);
        },
    }, 64);
    await assert.rejects(oversizedResponse.request(createRequest()), /frame exceeds the configured limit/);
});

test("WASM rejects mismatched request IDs", async () => {
    const client = new InjectedClient({
        async request() {
            return acknowledged(2);
        },
    }, 1024);
    await assert.rejects(client.request(createRequest(1)), /response request id did not match/);
});

test("the request queue is bounded and cancellation reaches the transport", async () => {
    let resolveRequest;
    let cancellations = 0;
    const client = new InjectedClient({
        request() {
            return new Promise(resolve => {
                resolveRequest = resolve;
            });
        },
        cancel() {
            cancellations++;
        },
    }, 1024);

    const pending = client.request(createRequest());
    await assert.rejects(client.request(createRequest(2)), /request queue is full/);
    client.cancel();
    assert.equal(cancellations, 1);
    resolveRequest(acknowledged());
    await assert.rejects(pending, /request was cancelled/);
});

test("disconnect and explicit reconnect replace the transport without retry", async () => {
    let disconnects = 0;
    let firstCalls = 0;
    const client = new InjectedClient({
        async request() {
            firstCalls++;
            return acknowledged();
        },
        disconnect() {
            disconnects++;
        },
    }, 1024);

    assert.throws(() => client.reconnect({ request: async () => acknowledged() }), /connected client cannot reconnect/);

    client.disconnect();
    assert.equal(client.state, "disconnected");
    await assert.rejects(client.request(createRequest()), /client is disconnected/);
    assert.equal(firstCalls, 0);
    assert.equal(disconnects, 1);

    let replacementCalls = 0;
    client.reconnect({
        async request() {
            replacementCalls++;
            return acknowledged();
        },
    });
    await client.request(createRequest());
    assert.equal(replacementCalls, 1);
});

test("transport rejection disconnects and shutdown is terminal", async () => {
    let shutdowns = 0;
    const client = new InjectedClient({
        async request() {
            throw new Error("transport unavailable");
        },
        shutdown() {
            shutdowns++;
        },
    }, 1024);

    await assert.rejects(client.request(createRequest()), /transport unavailable/);
    assert.equal(client.state, "disconnected");
    client.reconnect({
        async request() {
            return acknowledged();
        },
        shutdown() {
            shutdowns++;
        },
    });
    client.shutdown();
    assert.equal(shutdowns, 1);
    assert.equal(client.state, "closed");
    assert.throws(() => client.reconnect({ request: async () => acknowledged() }), /cannot reconnect/);
    await assert.rejects(client.request(createRequest()), /client is closed/);
});