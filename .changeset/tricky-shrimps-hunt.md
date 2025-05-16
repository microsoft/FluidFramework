---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
TreeAlpha identifier APIs for converting, retrieving, and generating identifiers.

## TreeAlpha.identifier
You can retrieve the long identifier with `TreeAlpha.identifier(node)`, where `node` is a `TreeNode`.
If the node does not contain an identifier field, it will return `undefined`

```typescript
const longIdentifier = TreeAlpha.identifier(node)
```

## TreeAlpha.identifier.shorten
You can shorten a long identifier with `TreeAlpha.identifier.shorten(identifier)` where `identifier` is a `string`.
If it's not possible to shorten the `identifier`, it will return `undefined`.
If the method returns a valid short identifier, this identifier can be passed into `TreeAlpha.identifier.lengthen(shortenedIdentifier)`
to get the original`identifier` back.

```typescript
const shortenedIdentifier = TreeAlpha.identifier.shorten(identifier)

// This identifier will be equivalent to the original identifier, as long as shortenedIdentifier is not undefined.
const lengthenedIdentifier = TreeAlpha.identifier.lengthen(shortenedIdentifier)
```

## TreeAlpha.identifier.lengthen
You can lengthen a short identifier with `TreeAlpha.identifier.lengthen(identifier)` where `identifier` is a `number`.
If it's not possible to lengthen the `identifier`, this method will throw an error.
If the method returns a valid long identifier, this identifier can be passed into `TreeAlpha.identifier.shorten(lengthenedIdentifier)`
to get the original `identifier` back.

```typescript
const lengthenedIdentifier = TreeAlpha.identifier.lengthen(identifier)

// This identifier will be equivalent to the original identifier.
const shortenedIdentifier = TreeAlpha.identifier.shorten(lengthenedIdentifier)
```

## TreeAlpha.identifier.getShort
You can retrieve the short identifier from a node with `TreeAlpha.identifier.getShort(node)` where `node` is a `TreeNode`.
If it is not possible to retrieve the short identifier, it will return `undefined`

```typescript
const shortIdentifier = TreeAlpha.identifier.getShort(node)
```

## TreeAlpha.identifier.create
You can create a long identifier from a branch with `TreeAlpha.identifier.create(branch)` where `branch` is a `TreeBranch`.

```typescript
const createdIdentifier = TreeAlpha.identifier.create(branch)
```
