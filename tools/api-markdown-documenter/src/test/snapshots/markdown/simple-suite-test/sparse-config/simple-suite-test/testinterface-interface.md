## TestInterface

Test interface

### Signature {#testinterface-signature}

```typescript
export interface TestInterface
```

### Remarks {#testinterface-remarks}

Here are some remarks about the interface

### Construct Signatures

| ConstructSignature | Return Type | Description |
| --- | --- | --- |
| [new (): TestInterface](docs/simple-suite-test/testinterface-_new_-constructsignature) | [TestInterface](docs/simple-suite-test/testinterface-interface) | Test construct signature. |

### Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](docs/simple-suite-test/testinterface-testclasseventproperty-propertysignature) | `readonly` | () =&gt; void | Test interface event property |

### Properties

| Property | Modifiers | Default Value | Type | Description |
| --- | --- | --- | --- | --- |
| [testInterfaceProperty](docs/simple-suite-test/testinterface-testinterfaceproperty-propertysignature) |  |  | number | Test interface property |
| [testOptionalInterfaceProperty](docs/simple-suite-test/testinterface-testoptionalinterfaceproperty-propertysignature) | `optional` | 0 | number | Test optional property |

### Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testInterfaceMethod()](docs/simple-suite-test/testinterface-testinterfacemethod-methodsignature) | void | Test interface method |

### Call Signatures

| CallSignature | Description |
| --- | --- |
| [(event: 'testCallSignature', listener: (input: unknown) =&gt; void): any](docs/simple-suite-test/testinterface-_call_-callsignature) | Test interface event call signature |
| [(event: 'anotherTestCallSignature', listener: (input: number) =&gt; string): number](docs/simple-suite-test/testinterface-_call__1-callsignature) | Another example call signature |

### See Also {#testinterface-see-also}

[testInterfaceMethod()](docs/simple-suite-test/testinterface-testinterfacemethod-methodsignature)

[testInterfaceProperty](docs/simple-suite-test/testinterface-testinterfaceproperty-propertysignature)

[testOptionalInterfaceProperty](docs/simple-suite-test/testinterface-testoptionalinterfaceproperty-propertysignature)

[testClassEventProperty](docs/simple-suite-test/testinterface-testclasseventproperty-propertysignature)
