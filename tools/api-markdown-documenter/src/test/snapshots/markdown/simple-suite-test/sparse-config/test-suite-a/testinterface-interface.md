## TestInterface

Test interface

<h3 id="testinterface-signature">Signature</h3>

```typescript
export interface TestInterface
```

<h3 id="testinterface-remarks">Remarks</h3>

Here are some remarks about the interface

### Constructors

| Constructor | Return Type | Description |
| - | - | - |
| [new (): TestInterface](docs/test-suite-a/testinterface-_new_-constructsignature) | [TestInterface](docs/test-suite-a/testinterface-interface) | Test construct signature. |

### Events

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [testClassEventProperty](docs/test-suite-a/testinterface-testclasseventproperty-propertysignature) | `readonly` | () => void | Test interface event property |

### Properties

| Property | Modifiers | Default Value | Type | Description |
| - | - | - | - | - |
| [getterProperty](docs/test-suite-a/testinterface-getterproperty-property) | `readonly` | | boolean | A test getter-only interface property. |
| [propertyWithBadInheritDocTarget](docs/test-suite-a/testinterface-propertywithbadinheritdoctarget-propertysignature) | | | boolean | |
| [setterProperty](docs/test-suite-a/testinterface-setterproperty-property) | | | boolean | A test property with a getter and a setter. |
| [testInterfaceProperty](docs/test-suite-a/testinterface-testinterfaceproperty-propertysignature) | | | number | Test interface property |
| [testOptionalInterfaceProperty](docs/test-suite-a/testinterface-testoptionalinterfaceproperty-propertysignature) | `optional` | 0 | number | Test optional property |

### Methods

| Method | Return Type | Description |
| - | - | - |
| [testInterfaceMethod()](docs/test-suite-a/testinterface-testinterfacemethod-methodsignature) | void | Test interface method |

### Call Signatures

| CallSignature | Description |
| - | - |
| [(event: 'testCallSignature', listener: (input: unknown) => void): any](docs/test-suite-a/testinterface-_call_-callsignature) | Test interface event call signature |
| [(event: 'anotherTestCallSignature', listener: (input: number) => string): number](docs/test-suite-a/testinterface-_call__1-callsignature) | Another example call signature |

<h3 id="testinterface-see-also">See Also</h3>

[testInterfaceMethod()](docs/test-suite-a/testinterface-testinterfacemethod-methodsignature)

[testInterfaceProperty](docs/test-suite-a/testinterface-testinterfaceproperty-propertysignature)

[testOptionalInterfaceProperty](docs/test-suite-a/testinterface-testoptionalinterfaceproperty-propertysignature)

[testClassEventProperty](docs/test-suite-a/testinterface-testclasseventproperty-propertysignature)
