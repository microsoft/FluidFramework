---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Adds `withDefault` API to allow defining default values for required and optional fields

The `withDefault` API is now available on `SchemaFactoryAlpha`. It allows you to specify default values for fields,
making them optional in constructors even when the field is marked as required in the schema.
This provides a better developer experience by reducing boilerplate when creating objects.

## Usage

The `withDefault` API wraps a field schema and defines a default value to use when the field is not provided during
construction. The default value must be of an allowed type of the field. You can provide defaults in two ways:

- **A value**: When a value is provided directly, the data is copied for each use to ensure independence between instances
- **A generator function**: A function that is called each time to produce a fresh value

Defaults are evaluated eagerly during node construction.

### Required Fields with Defaults

```typescript
import { SchemaFactoryAlpha, TreeAlpha } from "@fluidframework/tree/alpha";

const sf = new SchemaFactoryAlpha("example");

class Person extends sf.object("Person", {
	name: sf.required(sf.string),
	age: sf.withDefault(sf.required(sf.number), 0),
	role: sf.withDefault(sf.required(sf.string), "guest"),
}) {}

// Before: all fields were required
// const person = new Person({ name: "Alice", age: 0, role: "guest" });

// After: fields with defaults are optional
const person = new Person({ name: "Alice" });
// person.age === 0
// person.role === "guest"

// You can still provide values to override the defaults
const admin = new Person({ name: "Bob", age: 30, role: "admin" });
```

### Optional Fields with Custom Defaults

Optional fields (`sf.optional`) already default to `undefined`, but `withDefault` allows you to specify a different
default value:

```typescript
class Config extends sf.object("Config", {
	timeout: sf.withDefault(sf.optional(sf.number), 5000),
	retries: sf.withDefault(sf.optional(sf.number), 3),
}) {}

// All fields are optional, using custom defaults when not provided
const config = new Config({});
// config.timeout === 5000
// config.retries === 3

const customConfig = new Config({ timeout: 10000 });
// customConfig.timeout === 10000
// customConfig.retries === 3
```

### Value Defaults vs Function Defaults

When you provide a value directly, the data is copied for each use, ensuring each instance is independent:

```typescript
class Metadata extends sf.object("Metadata", {
	tags: sf.array(sf.string),
	version: sf.number,
}) {}

class Article extends sf.object("Article", {
	title: sf.required(sf.string),

	// a node is provided directly, it is copied for each use
	metadata: sf.withDefault(sf.optional(Metadata), new Metadata({ tags: [], version: 1 })),

	// also works with arrays
	authors: sf.withDefault(sf.optional(sf.array(sf.string)), []),
}) {}

const article1 = new Article({ title: "First" });
const article2 = new Article({ title: "Second" });

// each article gets its own independent copy
assert(article1.metadata !== article2.metadata);
article1.metadata.version = 2; // Doesn't affect article2
assert(article2.metadata.version === 1);
```

Alternatively, you can use generator functions to explicitly create new instances:

```typescript
class Article extends sf.object("Article", {
	title: sf.required(sf.string),

	// generators are called each time to create a new instance
	metadata: sf.withDefault(sf.optional(Metadata), () => new Metadata({ tags: [], version: 1 })),
	authors: sf.withDefault(sf.optional(sf.array(sf.string)), () => []),
}) {}
```

### Dynamic Defaults

Generator functions are called each time a new node is created, enabling dynamic defaults:

```typescript
class Document extends sf.object("Document", {
	id: sf.withDefault(sf.required(sf.string), () => crypto.randomUUID()),
	createdAt: sf.withDefault(sf.required(sf.number), () => Date.now()),
	title: sf.required(sf.string),
}) {}

const doc1 = new Document({ title: "First Document" });
const doc2 = new Document({ title: "Second Document" });
// doc1.id !== doc2.id (each gets a unique UUID)
// doc1.createdAt !== doc2.createdAt (each gets a different timestamp)
```

Generator functions work with all primitive types:

```typescript
let counter = 0;

class GameState extends sf.object("GameState", {
	playerId: sf.withDefault(sf.required(sf.string), () => `player-${counter++}`),
	score: sf.withDefault(sf.required(sf.number), () => Math.floor(Math.random() * 100)),
	isActive: sf.withDefault(sf.required(sf.boolean), () => counter % 2 === 0),
}) {}
```

### Type Safety

The default value (or the value returned by a generator function) must be of an allowed type for the field. TypeScript
enforces this at compile time:

```typescript
class Config extends sf.object("Config", {
	port: sf.optional(sf.number),
	name: sf.optional(sf.string),
}) {}

// ✅ Valid: number default for number field
sf.withDefault(sf.optional(sf.number), 8080);

// ✅ Valid: generator returns string for string field
sf.withDefault(sf.optional(sf.string), () => "localhost");

// ❌ TypeScript error: string default for number field
// sf.withDefault(sf.optional(sf.number), "8080");

// ❌ TypeScript error: generator returns number for string field
// sf.withDefault(sf.optional(sf.string), () => 8080);
```
