---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Array and Map nodes can now be explicitly constructed with undefined or no argument

The input parameter to the constructor and `create` methods of Array and Map nodes is now optional. When the optional parameter is omitted, an empty map or array will be created.

```typescript
class Schema extends schemaFactory.array("x", schemaFactory.number) {}

// Existing support
const _fromIterable: Schema = new Schema([]);

// New
const _fromUndefined: Schema = new Schema(undefined);
const _fromNothing: Schema = new Schema();
```

```typescript
class Schema extends schemaFactory.map("x", schemaFactory.number) {}

// Existing support
const _fromIterable: Schema = new Schema([]);
const _fromObject: Schema = new Schema({});

// New
const _fromUndefined: Schema = new Schema(undefined);
const _fromNothing: Schema = new Schema();
```

```typescript
const Schema = schemaFactory.array( schemaFactory.number);
type Schema = NodeFromSchema<typeof Schema>;

// Existing support
const _fromIterable: Schema = Schema.create([]);

// New
const _fromUndefined: Schema = Schema.create(undefined);
const _fromNothing: Schema = Schema.create();
```

```typescript
const Schema = schemaFactory.map(schemaFactory.number);
type Schema = NodeFromSchema<typeof Schema>;
// Existing support
const _fromIterable: Schema = Schema.create([]);
const _fromObject: Schema = Schema.create({});

// New
const _fromUndefined: Schema = Schema.create(undefined);
const _fromNothing: Schema = Schema.create();
```
