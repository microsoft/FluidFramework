---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Track annotations across array and formatted text edits

You can now track ranges with application-defined data, such as review comments, through edits to arrays and formatted text.
The new alpha APIs `ExtrinsicLocations.createArraySchema` and `FormattedText.createSchemaWithRanges` provide this capability.
Both expose ranges and their associated data through a `ranges` property.

These APIs are early `@alpha` features and are not yet production-ready.
Configure SharedTree with `minVersionForCollab` of at least `2.80.0`.
In this early `@alpha` version, concurrent changes anywhere in the document can reject a content or range edit rather than merge it: this version is intended for API experimentation and feedback, not production use.

#### Arrays

Use [`ExtrinsicLocations`](https://fluidframework.com/docs/api/tree/extrinsiclocations-namespace) to create an array schema with tracked ranges.
Edit content through `transactOnContent` to maintain ranges across insertions, removals, and moves.

```typescript
import { ExtrinsicLocations, SchemaFactoryBeta } from "@fluidframework/tree/alpha";

const sf = new SchemaFactoryBeta("com.example.review");
class Document extends ExtrinsicLocations.createArraySchema(sf, sf.string, sf.string) {}

const document = Document.create(["Plan", "Build", "Ship"]);
const comment = document.ranges.trackNewRange(
	"comment",
	{ start: 1, end: 3 },
	"Check these steps",
);
document.transactOnContent((content) => content.insertAt(0, "Design"));
document.content.slice(comment.start.index, comment.end.index); // ["Build", "Ship"]
```

#### Formatted text

Use [`FormattedText.createSchemaWithRanges`](https://fluidframework.com/docs/api/tree/formattedtext-namespace) for text whose existing editing methods maintain ranges automatically.
It accepts the same arguments as `FormattedText.createSchema`, followed by a schema for range data.

```typescript
import {
	FormattedText,
	SchemaFactoryBeta,
	TreeViewConfiguration,
	createIndependentTreeAlpha,
} from "@fluidframework/tree/alpha";

const sf = new SchemaFactoryBeta("com.example.annotatedText");
class Format extends sf.object("Format", { bold: sf.boolean }) {}
class Comment extends sf.object("Comment", { message: sf.string }) {}
class Text extends FormattedText.createSchemaWithRanges(
	sf,
	Format,
	[],
	{ bold: false },
	Comment,
) {}

const view = createIndependentTreeAlpha({ minVersionForCollab: "2.80.0" }).viewWith(
	new TreeViewConfiguration({ schema: Text }),
);
view.initialize(Text.fromString("Hello world"));
const text = view.root;
const comment = text.ranges.trackNewRange(
	"comment",
	{ start: 6, end: 11 },
	{ message: "Review this word" },
);
text.insertAt(0, "Say: ");
const { start, end } = comment; // start.index === 11, end.index === 16
text.getString(start.index, end.index); // "world"
```

Existing formatted text can be upgraded to support ranges without rewriting its content.
See the `FormattedText` namespace documentation for details.
