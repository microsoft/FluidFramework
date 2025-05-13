# @fluidframework/eslint-plugin-fluid Changelog

## [0.1.5](https://github.com/microsoft/FluidFramework/releases/tag/eslint-plugin-fluid_v0.1.5)

### Safe Record Access Improvements

Added support for two new patterns in the no-unchecked-record-access ESLint rule:

1. **Nullish Coalescing Assignment Recognition**
   - The rule now recognizes nullish coalescing assignment (`??=`) as a valid safety check
   - Properties accessed after a nullish coalescing assignment will not trigger warnings

2. **Else Block Assignment Handling**
   - Added detection for property assignments in else blocks of existence checks
   - Example pattern now supported:
     ```typescript
     if ("key" in obj) {
       // use obj.key
     } else {
       obj.key = defaultValue;
       // use obj.key
     }
     ```
   - The rule understands that after the else block assignment, the property is safe to use
   - Works with both direct property access and computed property access
