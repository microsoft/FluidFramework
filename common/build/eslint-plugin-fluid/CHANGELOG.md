# @fluidframework/eslint-plugin-fluid Changelog

## [0.3.1](https://github.com/microsoft/FluidFramework/releases/tag/eslint-plugin-fluid_v0.3.1)

Fixes indexing issues in the following rules, which would cause incorrect notification ranges and could cause malformed code fixes:

- `@fluid-internal/fluid/no-file-path-links-in-jsdoc`
- `@fluid-internal/fluid/no-hyphen-after-jsdoc-tag`
- `@fluid-internal/fluid/no-markdown-links-in-jsdoc`

## [0.3.0](https://github.com/microsoft/FluidFramework/releases/tag/eslint-plugin-fluid_v0.3.0)

New rules added:

- `@fluid-internal/fluid/no-hyphen-after-jsdoc-tag`: Forbids following a JSDoc/TSDoc comment tag with a `-`.
    - Such syntax is commonly used by mistake, due to the fact that `TSDoc` requires a hyphen after the parameter name of a `@param` comment. But no tags want a hyphen between the tag name and the body.

## [0.2.0](https://github.com/microsoft/FluidFramework/releases/tag/eslint-plugin-fluid_v0.2.0)

New rules added:

- `@fluid-internal/fluid/no-markdown-links-in-jsdoc`: Forbids the use of Markdown link syntax in JSDoc/TSDoc comments.
    - Such links are not supported by TSDoc spec and are not supported by some of our tooling.
      `{@link}` syntax should be used instead.
- `@fluid-internal/fluid/no-file-path-links-in-jsdoc`: Forbids the use of file paths in `{@link}` tags in JSDoc/TSDoc comments.
    - Such links are not portable and will cause problems for external users.
      Stable, externally accessible link targets should be used instead (for example, other APIs or GitHub URLs).

## [0.1.6](https://github.com/microsoft/FluidFramework/releases/tag/eslint-plugin-fluid_v0.1.6)

Dependency updates:

- `@microsoft/tsdoc` from `0.14.2` to `0.15.1`
- `@typescript-eslint/parser` from `6.21.0` to `7.18.0`

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
