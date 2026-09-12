import init, { BrowserClient } from "./pkg/fluid_webtransport_browser.js";

const encoder = new TextEncoder();
const parameters = new URLSearchParams(location.search);
const transportUrl = parameters.get("transport");
const certificateHex = parameters.get("hash");

function fail(message) {
    throw new Error(message);
}

function assert(condition, message) {
    if (!condition) fail(message);
}

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
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    return concat(u32(bytes.length), bytes);
}

function reference(position) {
    return position === undefined ? new Uint8Array([0]) : concat(new Uint8Array([1]), field(position));
}

function optional(value) {
    return value === undefined ? new Uint8Array([0]) : concat(new Uint8Array([1]), field(value));
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

function parseFrame(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert(new TextDecoder().decode(bytes.slice(0, 4)) === "FSP4", "response magic mismatch");
    assert(view.getUint16(4) === 1, "response version mismatch");
    assert(view.getUint32(16) + 20 === bytes.length, "response length mismatch");
    return { kind: bytes[6], body: bytes.slice(20) };
}

function takeField(state) {
    const view = new DataView(state.bytes.buffer, state.bytes.byteOffset, state.bytes.byteLength);
    const length = view.getUint32(state.offset);
    state.offset += 4;
    const value = state.bytes.slice(state.offset, state.offset + length);
    state.offset += length;
    return value;
}

function submittedPosition(response) {
    const parsed = parseFrame(response);
    assert(parsed.kind === 65, `expected submitted response, received ${parsed.kind}`);
    const state = { bytes: parsed.body, offset: 1 };
    return takeField(state);
}

function readCount(response) {
    const parsed = parseFrame(response);
    assert(parsed.kind === 66, `expected read response, received ${parsed.kind}`);
    return new DataView(parsed.body.buffer, parsed.body.byteOffset, parsed.body.byteLength).getUint32(0);
}

function errorCode(response) {
    const parsed = parseFrame(response);
    assert(parsed.kind === 127, `expected error response, received ${parsed.kind}`);
    return new DataView(parsed.body.buffer, parsed.body.byteOffset, parsed.body.byteLength).getUint16(0);
}

async function request(client, requestId, kind, ...body) {
    return client.request(frame(requestId, kind, ...body));
}

async function run() {
    assert(transportUrl, "missing transport URL");
    assert(certificateHex?.length === 64, "missing SHA-256 certificate hash");
    await init();
    const hash = Uint8Array.from(certificateHex.match(/../g), value => Number.parseInt(value, 16));
    const client = await BrowserClient.connect(transportUrl, hash, 1024 * 1024);
    let requestId = 1;

    assert(parseFrame(await request(client, requestId++, 1, field("browser-document"))).kind === 64, "create failed");
    assert(parseFrame(await request(
        client,
        requestId++,
        2,
        field("browser-document"),
        field("browser-writer"),
        field("browser-session"),
        reference(),
    )).kind === 64, "open session failed");

    const firstPosition = submittedPosition(await request(
        client,
        requestId++,
        3,
        field("browser-document"),
        field("browser-writer"),
        field("browser-session"),
        field("browser-submission-1"),
        u64(1),
        reference(),
        field("equivalent-payload"),
    ));
    submittedPosition(await request(
        client,
        requestId++,
        3,
        field("browser-document"),
        field("browser-writer"),
        field("browser-session"),
        field("browser-submission-2"),
        u64(2),
        reference(firstPosition),
        field("second-payload"),
    ));
    assert(readCount(await request(client, requestId++, 4, field("browser-document"), optional())) > 0, "read was empty");
    assert(errorCode(await request(
        client,
        requestId++,
        4,
        field("browser-document"),
        optional(encoder.encode("malformed-token")),
    )) === 4, "malformed token was not rejected");
    assert(parseFrame(await request(
        client,
        requestId++,
        6,
        field("browser-document"),
        reference(firstPosition),
        optional(),
        field("browser-snapshot"),
    )).kind === 64, "snapshot publication failed");
    assert(parseFrame(await request(client, requestId++, 5, field("browser-document"))).kind === 67, "latest snapshot failed");

    client.disconnect();
    let disconnected = false;
    try {
        await request(client, requestId++, 5, field("browser-document"));
    } catch {
        disconnected = true;
    }
    assert(disconnected, "request unexpectedly retried after disconnect");
    await client.reconnect();
    const resumedCount = readCount(await request(
        client,
        requestId++,
        4,
        field("browser-document"),
        optional(firstPosition),
    ));
    assert(resumedCount > 0, "explicit reconnect did not resume after the opaque token");

    return {
        status: "passed",
        browser: navigator.userAgent,
        wireBytes: client.wireBytes.toString(),
        peakResponseBytes: client.peakResponseBytes,
        reconnectMilliseconds: client.lastReconnectMilliseconds,
        resumedRecords: resumedCount,
    };
}

window.__webtransportResult = run()
    .then(result => {
        document.querySelector("#result").textContent = JSON.stringify(result);
        return result;
    })
    .catch(error => {
        const result = { status: "failed", error: String(error?.stack ?? error) };
        document.querySelector("#result").textContent = JSON.stringify(result);
        return result;
    });
