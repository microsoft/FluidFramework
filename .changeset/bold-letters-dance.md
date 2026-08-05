---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Promote FormattedText APIs to alpha

The [`FormattedText`](https://fluidframework.com/docs/api/fluid-framework/formattedtext-namespace) namespace is now available from the `@fluidframework/tree/alpha` entrypoint.
It provides a generic, collaborative rich-text domain built on SharedTree, parameterized by the formatting you want to associate with each unit of text and by any extra "atom" (embedded object) types you want to allow alongside plain characters.

Use `FormattedText.createSchema` to generate a text schema for your chosen formatting, then treat the resulting node like a formatted string.

```typescript
import { SchemaFactory} from "fluid-framework";
import { SchemaFactoryBeta } from "fluid-framework/beta";
import { FormattedText } from "fluid-framework/alpha";

// Note that a beta schema factory is currently required for use with `FormattedText`
const schemaFactory = new SchemaFactoryBeta("com.example.doc");

// Describe the formatting associated with each character.
class CharacterFormat extends schemaFactory.object("CharacterFormat", {
	bold: SchemaFactory.boolean,
	italic: SchemaFactory.boolean,
}) {}

// Generate the formatted-text schema. The last argument is the format applied
// to text inserted through the non-formatted APIs (for example `fromString`).
class RichText extends FormattedText.createSchema(
	schemaFactory,
	CharacterFormat,
	[], // No extra embedded atom types.
	{ bold: false, italic: false },
) {}
```

Once you have a schema, you can construct and edit formatted text:

```typescript
// Create some text using the default format.
const text = RichText.fromString("hello world");

// Append more text with an explicit format.
text.insertAt(text.characterCount(), "!", { bold: true, italic: false });

// Bold everything from index 0 up to (but not including) index 5.
text.formatRange(0, 5, { bold: true });

// Read back the content with its associated formatting.
for (const atom of text.charactersWithFormatting()) {
	console.log(atom.content, atom.format.bold, atom.format.italic);
}
```

`FormattedText` is currently surfaced as an alpha API and is subject to change.
