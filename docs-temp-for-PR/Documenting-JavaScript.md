Unless otherwise indicated, our [TypeScript Documentation Guidelines](https://github.com/microsoft/FluidFramework/wiki/Documenting-TypeScript) should be followed for JavaScript code.
This helps encourage consistency across our repo, and also alleviates the need for developers to remember 2 different sets of documentation syntax.

This includes the set of [tags](https://github.com/microsoft/FluidFramework/wiki/TSDoc-Guidelines/#tsdoc-tags) supported by [TSDoc](https://tsdoc.org/).
Unless there is a real need to do so, tags should be limited to those supported by TSDoc.

## Exceptions

Notable exceptions to the above statement include:

### Parameter Types

In TypeScript, we don't explicitly document parameter types, since the type system encapsulates that information.
In JavaScript, we don't have that luxury, so we encourage adding the type information to parameter docs.

#### Parameter Types Example

```javascript
/**
 * Adds 2 numbers together
 * @param {number} a - One of the numbers being added
 * @param {number} b - One of the numbers being added
 */
const add = (a, b) => {
    ...
};
```
