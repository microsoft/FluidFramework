---
uid: SharedCell
---

# SharedCell

- Package: [@microsoft/fluid-cell](../api/fluid-cell.md)
- API documentation: [SharedCell](../api/fluid-cell.sharedcell.md)

The SharedCell distributed data structure can be used to wrap an Object so that it can be used like a distributed data
structure.

## Creation

To create a `SharedCell`, call the static create method:

```typescript
const myCell = SharedCell.create(this.runtime, id);
```

## Usage

A SharedCell is a specialized data structure that simply wraps a plain JavaScript object in a simple distributed data
structure. You can then add listeners that will be called when the object stored in the SharedCell changes.

SharedCell's can be useful to create boundaries around what parts of your data model pieces of your app have access to.
For example, when using React components for UI rendering, it can be useful to pass in (as props) only the object that
the React component needs to manipulate rather than passing the entire data model object. By wrapping the object in a
SharedCell, you can wire up event handlers in the React component without passing in all the shared data.
