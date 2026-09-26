---
"__section": other
---
Add experimental Rust session factory interception

Rust callers can decorate a document factory before local session allocation, preserving concrete availability handles and all session facets:

```rust
use sea_core::factory::{PassThroughFactory, SessionFactory};
use sea_sequencer::factory::LocalSessionFactory;

let factory = PassThroughFactory::new(LocalSessionFactory::new(sequencer.clone()));
let opened = factory.open_session(None).await?;
```

The built-in server exposes the same opt-in pass-through path with `SEA_EXPERIMENTAL_SESSION_FACTORY=true`.
Native and browser Rust clients can use `WebTransportSessionFactory` to open independent sessions on one fixed document through the same factory contract.
Existing construction paths stay direct by default.
Pass-through adds no rejection policy, automatic session cleanup, delivery tracking, or cache-retention limit.
