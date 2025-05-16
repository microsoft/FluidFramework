---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
TreeAlpha identifier APIs for converting, retrieving, and generating identifiers.

## TreeAlpha.identifier
You can retrieve the long identifier with `TreeAlpha.identifier(node)`, where `node` is a `TreeNode`.
If the node does not contain an identifier field, it will return `undefined`

### Valid node with identifier.
```typescript
// This returns the long identifier from the node.
const longIdentifier = TreeAlpha.identifier(node)
```

### Examples when you get undefined
In some cases, this method will be unable to retrieve an identifier.\
This will occur in the following cases:\
- The node does not contain an identifier field.
- The node is an unhydrated node with a user provided identifier. Note that if it is an unhydrated node without an identifier provided, it will throw an error.

```typescript
// This returns undefined.
const longIdentifier = TreeAlpha.identifier(node)
```

## TreeAlpha.identifier.shorten
You can shorten a long identifier with `TreeAlpha.identifier.shorten(branch, identifier)`, where `branch` is a `TreeBranch`, and `identifier` is a `string`.
If it's not possible to shorten the `identifier`, it will return `undefined`.

### Valid long identifier
If the method returns a valid short identifier, this identifier can be passed into `TreeAlpha.identifier.lengthen(shortenedIdentifier)`
to get the original valid long `identifier` back.
```typescript
const shortenedIdentifier = TreeAlpha.identifier.shorten(branch, validLongIdentifier)

// This "lengthenedIdentifier" will be equivalent to the original "validLongIdentifier".
const lengthenedIdentifier = TreeAlpha.identifier.lengthen(branch, shortenedIdentifier)
```

### Invalid long identifier
```typescript
// This "shortenedIdentifier" will be "undefined", since the provided identifier is invalid, and cannot be shortened.
const shortenedIdentifier = TreeAlpha.identifier.shorten(branch, invalidLongIdentifier)
```

## TreeAlpha.identifier.lengthen
You can lengthen a short identifier with `TreeAlpha.identifier.lengthen(identifier)`, where `branch` is a `TreeBranch`, and `identifier` is a `number`.
If it's not possible to lengthen the `identifier`, this method will throw an error.

### Valid short identifier
If the method returns a valid long identifier, this identifier can be passed into `TreeAlpha.identifier.shorten(lengthenedIdentifier)`
to get the original `identifier` back.
```typescript
const lengthenedIdentifier = TreeAlpha.identifier.lengthen(branch, validShortIdentifier)

// This "shortenedIdentifier" will be equivalent to the original "validShortIdentifier".
const shortenedIdentifier = TreeAlpha.identifier.shorten(branch, lengthenedIdentifier)
```

### Invalid short identifier
The identifier is an invalid short identifier unrecognized by
```typescript
// This will throw an error, as the identifier is invalid, and cannot be lengthened.
const lengthenedIdentifier = TreeAlpha.identifier.lengthen(branch, invalidShortIdentifier)
```

## TreeAlpha.identifier.getShort
You can retrieve the short identifier from a node with `TreeAlpha.identifier.getShort(node)` where `node` is a `TreeNode`.
If it is not possible to retrieve the short identifier, it will return `undefined`

### Node with valid identifier.
This will happen when the node contains a valid, compressible identifier recognized by the nodes' associated idCompressor.

```typescript
// This will retrieve the short identifier from the node.
const shortIdentifier = TreeAlpha.identifier.getShort(nodeWithValidIdentifier)
```

### Node with invalid identifier.
If the node provided does not contain an identifier that is recognized or compressible by the idCompressor, this method will return undefined.\
This will occur in the following cases:\
- The node is an unhydrated node with a user provided identifier. Note that if it is an unhydrated node without an identifier provided, it will throw an error.
- The node does not contain an identifier field.
- The node contains a compressible long identifier, but it is unrecognized by the node's associated idCompressor. This can occur if the identifier was created by a different idCompressor instance.
- The node contains an identifier which is not compressible by its idCompressor. This can occur if the node's identifier was a user provided string.

```typescript
// This will return undefined
const shortIdentifier = TreeAlpha.identifier.getShort(node)
```

## TreeAlpha.identifier.create
You can create a long identifier from a branch with `TreeAlpha.identifier.create(branch)` where `branch` is a `TreeBranch`.

```typescript
const createdIdentifier = TreeAlpha.identifier.create(branch)
```
