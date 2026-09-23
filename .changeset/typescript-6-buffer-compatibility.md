---
"@fluidframework/common-utils": minor
"__section": fix
---
Preserve typed-array buffer compatibility with TypeScript 6

`bufferToString` explicitly accepts `Uint8Array` inputs as well as `ArrayBufferLike` inputs, preserving existing typed-array usage with TypeScript 6.

`Uint8ArrayToArrayBuffer` now copies shared-backed storage into an `ArrayBuffer` to honor its return type.
Full views of ordinary `ArrayBuffer` instances still return the original buffer without copying.
