# @fluid-tools/api-markdown-documenter

## 0.13.0

### ⚠ BREAKING CHANGES

Removed `createDocumentWriter`, and exported `DocumentWriter` is now an interface rather than a class.
A `DocumentWriter` may be instantiated via `DocumentWriter.create` (or you can use your own implementation, which was not previously supported).

## 0.12.0

### ⚠ BREAKING CHANGES

Update `typescript` dependency from `4.x` to `5.x`.
