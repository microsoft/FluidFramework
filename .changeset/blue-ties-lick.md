---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add experimental SharedTree sandboxing APIs

The new alpha `Sandboxing.createHost` and `Sandboxing.createGuest` APIs synchronize a SharedTree view across a `MessagePort`.
The Host remains connected to Fluid services while the Guest exposes a normal schema-aware tree view on the other side of the message channel.
During initialization, the Host sends the Guest a serialized child ID space shard, so the endpoints do not share an ID compressor instance.

Sandboxing requires the ID compressor's V3 serialization format.
Set the container runtime's `oldestSupportedClient` option to `"3.4.0"` or later to enable that format.

```typescript
import {
	asBeta,
} from "@fluidframework/tree/beta";
import {
	FormatValidatorBasic,
	Sandboxing,
} from "@fluidframework/tree/alpha";

// Create the application-owned view that remains connected to Fluid services.
const hostView = asBeta(tree.viewWith(config));

// Create the message channel that crosses the sandbox boundary.
const channel = new MessageChannel();

// Connect the Host endpoint to the collaborative tree.
const host = Sandboxing.createHost({ main: hostView, port: channel.port1 });

// Create the independent Guest tree on the other side of the channel.
const guest = await Sandboxing.createGuest({
	port: channel.port2,
	treeOptions: { jsonValidator: FormatValidatorBasic },
});

// Open a schema-aware view for application code running in the sandbox.
const guestView = guest.tree.viewWith(config);
```
