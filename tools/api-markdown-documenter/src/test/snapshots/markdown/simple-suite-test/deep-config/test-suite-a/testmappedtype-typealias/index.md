# TestMappedType

[Packages](./) &gt; [test-suite-a](./test-suite-a/) &gt; [TestMappedType](./test-suite-a/testmappedtype-typealias/)

Test Mapped Type, using [TestEnum](./test-suite-a/testenum-enum/)

## Signature {#testmappedtype-signature}

```typescript
export type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

## Remarks {#testmappedtype-remarks}

Here are some remarks about the mapped type
