# TestMappedType

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestMappedType](/test-suite-a/testmappedtype-typealias/)

Test Mapped Type, using [TestEnum](/test-suite-a/testenum-enum/)

<a id="testmappedtype-signature"></a>

## Signature

```typescript
export type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

<a id="testmappedtype-remarks"></a>

## Remarks

Here are some remarks about the mapped type
