## TestMappedType

Test Mapped Type, using [TestEnum](docs/test-suite-a/testenum-enum)

<h3 id="testmappedtype-signature">Signature</h3>

```typescript
export type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

<h3 id="testmappedtype-remarks">Remarks</h3>

Here are some remarks about the mapped type
