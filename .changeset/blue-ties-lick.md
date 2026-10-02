---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add experimental SharedTree sandboxing APIs

The new alpha `Sandboxing.createHost` and `Sandboxing.createGuest` APIs synchronize a SharedTree view across a `MessagePort`.
The Host remains connected to Fluid services while the Guest exposes a normal schema-aware tree view on the other side of the message channel.

The current alpha implementation requires both endpoints to share the Host's identifier compressor and is intended for early experimentation.
Sandboxing requires the ID compressor's V3 serialization format.
Set the container runtime's `oldestSupportedClient` option to `"3.4.0"` or later to enable that format.

```typescript
import {
	FormatValidatorBasic,
	Sandboxing,
	asBeta,
} from "@fluidframework/tree/alpha";

const hostView = asBeta(tree.viewWith(config));
const channel = new MessageChannel();
const host = Sandboxing.createHost({ main: hostView, port: channel.port1 });
const guest = await Sandboxing.createGuest({
	port: channel.port2,
	idCompressor: host.idCompressor,
	treeOptions: { jsonValidator: FormatValidatorBasic },
});
const guestView = guest.tree.viewWith(config);
```
