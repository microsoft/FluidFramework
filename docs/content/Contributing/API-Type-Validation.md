# API Type Validation

To protect against API-level breaking changes, client packages leverage a _type validator_ tool.
This tool provides compile-time verification against unintended breaking changes to package APIs.
For packages it's integrated to, it runs as part of the build process, thus providing local and CI validation.

It works by generating a type validation file on a per-package basis. For each type exported from a package, that file contains statements which check the assignability of the current definition of that type against the previous definition of that type.
If a breaking change is _expected_, it also validates this with a `// ts-expect-error` statement.
The set of types that are expected to not be assignable is tracked in `package.json` under the "typeValidation" key.

## Details

- For a given package, the generated typescript file can be found at `test/types/validate<packageName>Previous.ts`.
- The "previous" version of the types are imported using a devDep on a previous version of that package.
  For example, `@fluidframework/sequence`'s package.json might look like this:

```json
{
	"name": "@fluidframework/sequence",
	"version": "1.2.0",
	"devDependencies": {
		"@fluidframework/sequence-previous": "npm:@fluidframework/sequence@1.1.0"
	}
}
```

- Type validation tests are integrated with package.json `build:compile` scripts to ensure the generated type validation file is up-to-date.

## Example

Suppose we wanted to remove the following deprecated API from `@fluidframework/sequence`, which was renamed in a previous release:

```typescript
export class IntervalCollection<TInterval extends ISerializableInterval> extends TypedEventEmitter<
	IIntervalCollectionEvent<TInterval>
> {
	// @deprecated (undocumented)
	addInternal(
		serializedInterval: ISerializedInterval,
		local: boolean,
		op: ISequencedDocumentMessage,
	): TInterval;

	/** ... other functions ... */
}
```

After deleting the method in the code, updating any stray usages, and updating `BREAKING.md`, the build will fail to compile with an error resembling this:

```text
src/test/types/validateSequencePrevious.ts:158:5 - error TS2345: Argument of type 'TypeOnly<import("E:/FluidFramework/packages/dds/sequence/dist/intervalCollection").IntervalCollection<any>>' is not assignable to parameter of type 'TypeOnly<import("E:/FluidFramework/node_modules/@fluidframework/sequence-previous/dist/intervalCollection").IntervalCollection<any>>'.
[build:commonjs]   Property 'addInternal' is missing in type 'TypeOnly<import("E:/FluidFramework/packages/dds/sequence/dist/intervalCollection").IntervalCollection<any>>' but required in type 'TypeOnly<import("E:/FluidFramework/node_modules/@fluidframework/sequence-previous/dist/intervalCollection").IntervalCollection<any>>'.
[build:commonjs]
[build:commonjs] 158     get_current_ClassDeclaration_IntervalCollection());
[build:commonjs]         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
[build:commonjs]
[build:commonjs]   ../../../node_modules/@fluidframework/sequence-previous/dist/intervalCollection.d.ts:187:5
[build:commonjs]     187     addInternal(serializedInterval: ISerializedInterval, local: boolean, op: ISequencedDocumentMessage): TInterval;
[build:commonjs]             ~~~~~~~~~~~
[build:commonjs]     'addInternal' is declared here.
```

This error message is easier to understand in terms of "current" and "old" versions of the code.
Import paths not passing through node_modules reference the current code (including the breaking change we're making),
and those including node_modules reference previous versions.
So this error message just tells us that the current definition of `IntervalCollection` cannot be assigned to the old definition of `IntervalCollection`,
because it's missing the `addInternal` method that we removed.
This is expected with the nature of the change,
so we can fix this compile-time issue by updating the package.json's `typeValidation` metadata using the following workflow.

Navigating to the error location (`src/test/types/validateSequencePrevious` on line 158), the source looks like this:

```typescript
/*
 * Validate back compat by using current type in place of old type
 * If breaking change required, add in package.json under typeValidation.broken:
 * "ClassDeclaration_IntervalCollection": {"backCompat": false}
 */
declare function get_current_ClassDeclaration_IntervalCollection(): TypeOnly<
	current.IntervalCollection<any>
>;
declare function use_old_ClassDeclaration_IntervalCollection(
	use: TypeOnly<old.IntervalCollection<any>>,
);
use_old_ClassDeclaration_IntervalCollection(get_current_ClassDeclaration_IntervalCollection());
```

The comment above those lines informs us which entry needs to be added to the "typeValidation" field in sequence's `package.json`:

```json
{
	// ... other package.json entries
	"typeValidation": {
		"version": "1.2.0",
		"broken": {
			"ClassDeclaration_IntervalCollection": { "backCompat": false }
		}
	}
}
```

After rebuilding, the error should now be gone.
