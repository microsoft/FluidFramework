---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
TreeAlpha identifier APIs for converting, retrieving, and generating identifiers have been added

#### TreeAlpha.identifier
You can retrieve the long identifier with `TreeAlpha.identifier(node)`, where `node` is a `TreeNode`.
In cases where the node does not yet have an identifier assigned, this will return `undefined`.
These cases include:
- The node does not contain an identifier field.
- The node is a non-hydrated node with a user provided identifier. Note that if it is a non-hydrated node without an identifier provided, it will throw an error.

#### TreeAlpha.identifier.shorten
You can shorten a long identifier with `TreeAlpha.identifier.shorten(branch, identifier)`, where `branch` is a `TreeBranch`, and `identifier` is a `string`.
If the method returns a valid short identifier, this identifier can be passed into `TreeAlpha.identifier.lengthen`
to get the original valid long `identifier` back.
In the cases where it's not possible to shorten the `identifier`, it will return `undefined`.
These cases include:
- A compressible long identifier, but it is unrecognized by the node's associated id compressor. This can occur if the identifier was created by a different id compressor instance.
- An identifier which is not compressible by its id compressor. This can occur if the node's identifier was a user provided string.

#### TreeAlpha.identifier.lengthen
You can lengthen a short identifier with `TreeAlpha.identifier.lengthen(branch, identifier)`, where `branch` is a `TreeBranch`, and `identifier` is a `number`.
If the method returns a valid long identifier, this identifier can be passed into `TreeAlpha.identifier.shorten` to get the original `identifier` back.
In the cases where it's not possible to lengthen the `identifier`, this method will throw an error.
These cases include:
- An unrecognized short identifier. This can occur if the identifier is either created by a user or a different id compressor instance.

#### TreeAlpha.identifier.getShort
You can retrieve the short identifier from a node with `TreeAlpha.identifier.getShort(node)` where `node` is a `TreeNode`.
If it is not possible to retrieve the short identifier, it will return `undefined`

##### Example for a node with valid identifier
```typescript
// This will retrieve the short identifier from the node.
const shortIdentifier = TreeAlpha.identifier.getShort(nodeWithValidIdentifier)
```

##### Examples for when you get undefined
In cases where the node provided does not contain an identifier that is recognized or compressible by the id compressor, this method will return undefined.
This will occur in the following cases:
- The node is an non-hydrated node with a user provided identifier. Note that if it is an non-hydrated node without an identifier provided, it will throw an error.
- The node does not contain an identifier field.
- The node contains a compressible long identifier, but it is unrecognized by the node's associated id compressor. This can occur if the identifier was created by a different id compressor instance.
- The node contains an identifier which is not compressible by its id compressor. This can occur if the node's identifier was a user provided string.
```typescript
// This will return undefined
const shortIdentifier = TreeAlpha.identifier.getShort(node)
```

#### TreeAlpha.identifier.create
You can create a long identifier from a branch with `TreeAlpha.identifier.create(branch)` where `branch` is a `TreeBranch`.
```typescript
const createdIdentifier = TreeAlpha.identifier.create(branch)
```
