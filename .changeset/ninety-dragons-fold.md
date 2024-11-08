---
"fluid-framework": minor
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
"@fluidframework/undo-redo": minor
---
---
"section": feature
---

### SharedString DDS annotateAdjustRange

This update introduces a new feature to the `SharedString` DDS, allowing for the adjustment of properties over a specified range. The `annotateAdjustRange` method enables users to apply adjustments to properties within a given range, providing more flexibility and control over property modifications.

An adjustment is a modification applied to a property value within a specified range. Adjustments can be used to increment or decrement property values dynamically. They are particularly useful in scenarios where property values need to be updated based on user interactions or other events. For example, in a rich text editor, adjustments can be used for modifying indentation levels or font sizes, where multiple users could apply differing numerical adjustments.

### Key Features and Use Cases:
- **Adjustments with Constraints**: Adjustments can include optional minimum and maximum constraints to ensure the final value falls within specified bounds. This is particularly useful for maintaining consistent formatting in rich text editors.
- **Consistent Property Changes**: The feature ensures that property changes are consistent, managing both local and remote changes effectively. This is essential for collaborative rich text editing where multiple users may be making adjustments simultaneously.
- **Rich Text Formatting**: Adjustments can be used to modify text properties such as font size, indentation, or other formatting attributes dynamically based on user actions.

### Configuration and Compatibility Requirements:
This feature is only available when the configuration `Fluid.Sequence.mergeTreeEnableAnnotateAdjust` is set to `true`. Additionally, all collaborating clients must have this feature enabled to use it. If any client does not have this feature enabled, it will lead to the client exiting collaboration. A future major version of Fluid will enable this feature by default.

### Usage Example:
```typescript
sharedString.annotateAdjustRange(start, end, {
    key: { value: 5, min: 0, max: 10 }
});
``
