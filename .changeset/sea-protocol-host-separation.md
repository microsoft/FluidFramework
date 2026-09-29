---
"__section": feature
---

Use typed document sessions without a network protocol adapter

Rust Sea hosting now separates `DocumentHost` from `SeaProtocolHost`.
In-process clients can create documents and open typed sessions directly, with classified storage and session-factory errors.
For network serving, wrap the configured document host in one protocol adapter and share that adapter across listeners:

```rust
let documents = DocumentHost::new(storage, sessions)?;
let protocol = Arc::new(SeaProtocolHost::new(documents));
let server = WebTransportServer::bind(address, identity, protocol, transport_config)?;
```

This replaces the combined `BuiltInSeaHost` API.
The server-side protocol module owns wire conversion, authority tokens, and connection cleanup; storage recovery and policies remain in the typed host.
Host shutdown also prevents pending direct calls from recovering documents after storage shutdown.
The wire format, executable configuration, and connection cleanup behavior are unchanged.
