---
"__section": fix
---
Allow Rust WebTransport connections to use multiple executor threads

The WebTransport server independently schedules bounded connection tasks instead of polling every connection in one listener task.
Shutdown joins cancelled tasks before service cleanup, and completion races do not repeat cleanup.
Ready response streams yield cooperatively.

The listener requests a 2 MiB UDP receive buffer when its existing buffer is smaller, reporting operating-system limits below that request.
This improves burst handling without changing host-wide settings, QUIC flow-control windows, session APIs, author ordering, or operation deadlines.
