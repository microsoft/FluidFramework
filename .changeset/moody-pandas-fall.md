---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": tree
---

New alpha APIs for schema evolution

There are now `@alpha` APIs for schema evolution which support adding optional fields to object node types without a staged rollout.

SharedTree has many safety checks in place to ensure applications understand the format of documents they must support.
One of these checks verifies that the view schema (defined in application's code) aligns with the document schema (determined by the document data at rest).
This helps to ensure that clients running incompatible versions of the application's code don't collaborate at the same time on some document, which could cause data loss or disrupt application invariants.
One general solution application authors can perform is to stage the rollout of a feature which changes document schema into multiple phases:

1. Release an application version which understands documents written with the new format but doesn't attempt to upgrade any documents
2. Wait for this application version to saturate in the app's ecosystem
3. Release an application version which upgrades documents to start leveraging the new format.

However, this process can be cumbersome for application authors: for many types of changes, an app author doesn't particularly care if older application code collaborates with newer code, as the only downside is that the older application version might not present a fully faithful experience.
As an example, consider an application which renders circles on a canvas (similar to what is presented [here](https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/docs/user-facing/schema-evolution.md)).
The application author might anticipate adding support to render the circle with various different other properties (border style, border width, background color, varying radius, etc.).
Therefore, they should declare their schema using `SchemaFactoryObjectOptions.allowUnknownOptionalFields` like so:

```typescript
import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";
// "Old" application code/schema
const factory = new SchemaFactoryAlpha("Geometry");
class Circle extends factory.object("Circle", {
	x: factory.number,
	y: factory.number,
}, { allowUnknownOptionalFields: true }) {}
```

Later, they add some of these features to their application:

```typescript
import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";
// "New" application code/schema
const factory = new SchemaFactoryAlpha("Geometry");
class Circle extends factory.object("Circle", {
	x: factory.number,
	y: factory.number,
	// Note that radius and color must both be declared as optional fields since this application must
	// support opening up existing documents that didn't have this information.
	radius: factory.optional(factory.number),
	color: factory.optional(factory.string), // ex: #00FF00
}, { allowUnknownOptionalFields: true }) {}
```

When they go to deploy this newer version of the application, they could opt to start upgrading documents as soon as the newer code is rolled out, and the older code would still be able to open up (and collaborate on) documents using the newer schema version.
Note that it's only important that the old *application code* elected to allow opening documents with unknown optional fields.
This policy is not persisted into documents in any form, so applications are free to modify it at any point.

For specific API details, see documentation on `SchemaFactoryObjectOptions.allowUnknownOptionalFields`.
For a more thorough discussion of this topic, see [Schema Evolvability](https://github.com/microsoft/FluidFramework/tree/main/packages/dds/tree#schema-evolvability) in the SharedTree README.
