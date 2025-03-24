---
"@fluidframework/core-utils": minor
---
---
"section": feature
---

Add `onAssertionFailure`

A new `@alpha` API is added called `onAssertionFailure` which can be used to get a callback when an assertion fails indicating a bug in the Fluid Framework.
This callback is invoked before the exception is thrown, reducing the chances of the exception being lost or replaced with a difference exception before making it to a catch block which reports it.
It can also be used to break into the debugger when the assertion occurs to aid in debugging the cause.

```ts
import { onAssertionFailure } from "fluid-framework/alpha";

let firstAssertion: Error | undefined;

onAssertionFailure((error: Error) => {
	const priorErrorNote =
		firstAssertion === undefined
			? "Please report this bug."
			: `Might be caused due to prior error ${JSON.stringify(firstAssertion.message)} which should be investigated first.`;
	const message = `Encountered Bug in Fluid Framework: ${error.message}\n${priorErrorNote}\n${error.stack}`;
	console.error(message);

	debugger;
	firstAssertion ??= error;
});
```
