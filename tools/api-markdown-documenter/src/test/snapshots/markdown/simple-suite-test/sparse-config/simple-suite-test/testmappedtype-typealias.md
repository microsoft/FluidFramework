## TestMappedType

Test Mapped Type, using [TestEnum](docs/simple-suite-test/testenum-enum)

### Signature {#testmappedtype-signature}

```typescript
export type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

### Remarks {#testmappedtype-remarks}

Here are some remarks about the mapped type
