## TestMappedType

Test Mapped Type, using [TestEnum](docs/test-suite-a/testenum-enum)

<a id="testmappedtype-signature"></a>

### Signature

```typescript
export type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

<a id="testmappedtype-remarks"></a>

### Remarks

Here are some remarks about the mapped type
