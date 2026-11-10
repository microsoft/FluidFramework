---
"@fluidframework/shared-object-base": minor
"__section": legacy
---
Add a way for shared objects to submit ops that contain no Fluid handles

The new protected method `SharedObjectCore.submitLocalMessageWithoutHandles` submits an op like `submitLocalMessage`, but without searching its content for Fluid handles to bind and encode.
A shared object can use it for ops it knows contain no handles, which avoids walking every object in the op.
An op that contains a handle must still be submitted with `submitLocalMessage`.

```typescript
class MySharedObject extends SharedObject {
	// ...
	private submitEdit(edit: MyEdit): void {
		if (edit.mayContainHandles) {
			this.submitLocalMessage(edit);
		} else {
			this.submitLocalMessageWithoutHandles(edit);
		}
	}
}
```