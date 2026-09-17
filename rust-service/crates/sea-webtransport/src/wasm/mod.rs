#![doc = "Generated browser, injected, and test-support Sea session bindings."]
mod sea;

pub use crate::protocol as sea_protocol_v1;

pub use sea::*;

use js_sys::{Array, Function, Reflect};
use wasm_bindgen::{JsCast as _, prelude::*};

#[wasm_bindgen(typescript_custom_section)]
const TYPESCRIPT_TRANSPORT: &str = r#"
/** Opens bidirectional byte streams for `SeaInjectedClient`. */
export interface AsyncRequestTransport {
    openBidirectional(): AsyncBidirectionalTransport | Promise<AsyncBidirectionalTransport>;
    disconnect?(): void;
}

/** One injected bidirectional byte stream. */
export interface AsyncBidirectionalTransport {
    send(bytes: Uint8Array): void | Promise<void>;
    finish(): void | Promise<void>;
    receive(): Promise<Uint8Array | undefined>;
    cancel(): void | Promise<void>;
}

/** A selected recovery snapshot. */
export interface SeaSnapshotLoadResult {
    readonly kind: SeaLoadKind.Snapshot;
    readonly snapshot: SeaSnapshot;
}

/** One catch-up or live event. */
export interface SeaEventLoadResult {
    readonly kind: SeaLoadKind.Event;
    readonly position: bigint;
    readonly payload: Uint8Array;
    readonly blobTree: SeaTreeId | undefined;
    readonly author: Uint8Array;
    readonly session: Uint8Array;
    readonly operation: Uint8Array;
    readonly reference: bigint | undefined;
    readonly minimumReference: bigint | undefined;
}

/** One out-of-band monitored delivery progress snapshot. */
export interface SeaProgressLoadResult {
    readonly kind: SeaLoadKind.Progress;
    readonly previous: bigint | undefined;
    readonly latestKnown: bigint | undefined;
    readonly status: SeaStreamStatus;
}

/** One closed case from a Sea load or archive-read stream. */
export type SeaLoadResult = SeaSnapshotLoadResult | SeaEventLoadResult | SeaProgressLoadResult;

/** Named children of one immutable directory. */
export type SeaDirectoryEntries = ReadonlyArray<SeaDirectoryEntry>;

/** A generated Sea service failure with its closed category. */
export interface SeaServiceError extends Error {
    readonly kind: SeaErrorKind;
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "AsyncRequestTransport")]
    pub type AsyncRequestTransport;

    #[wasm_bindgen(typescript_type = "SeaLoadResult")]
    pub type SeaLoadResult;

    #[wasm_bindgen(typescript_type = "SeaDirectoryEntries")]
    pub type SeaDirectoryEntries;
}

pub(crate) fn call_method(
    target: &JsValue,
    name: &str,
    arguments: &[JsValue],
) -> Result<JsValue, JsValue> {
    let method = Reflect::get(target, &JsValue::from_str(name))?;
    if method.is_null() || method.is_undefined() {
        return Err(js_error(&format!("transport does not implement {name}")));
    }
    let function = method
        .dyn_into::<Function>()
        .map_err(|_| js_error(&format!("transport member {name} is not callable")))?;
    function.apply(target, &Array::from_iter(arguments.iter()))
}

pub(crate) fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
