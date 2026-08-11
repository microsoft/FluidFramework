# TestMappedType

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestMappedType](/test-suite-a/testmappedtype-typealias)

Test Mapped Type, using [TestEnum](/test-suite-a/testenum-enum)

<h2 id="testmappedtype-signature">Signature</h2>

```typescript
export type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

<h2 id="testmappedtype-remarks">Remarks</h2>

Here are some remarks about the mapped type
