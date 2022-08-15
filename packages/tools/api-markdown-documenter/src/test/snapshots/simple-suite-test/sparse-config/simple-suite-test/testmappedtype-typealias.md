
# TestMappedType

Test Mapped Type, using [TestEnum](docs/simple-suite-test/testenum-enum)

## Remarks

Here are some remarks about the mapped type

## Signature

```typescript
export declare type TestMappedType = {
    [K in TestEnum]: boolean;
};
```
