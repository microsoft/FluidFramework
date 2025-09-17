## TestInterfaceExtendingOtherInterfaces

Test interface that extends other interfaces

<h3 id="testinterfaceextendingotherinterfaces-signature">Signature</h3>

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestMappedType, TestInterfaceWithTypeParameter<number>
```

**Extends**: [TestInterface](docs/test-suite-a/testinterface-interface), [TestMappedType](docs/test-suite-a/testmappedtype-typealias), [TestInterfaceWithTypeParameter](docs/test-suite-a/testinterfacewithtypeparameter-interface)\<number>

<h3 id="testinterfaceextendingotherinterfaces-remarks">Remarks</h3>

Here are some remarks about the interface

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
| [testMethod(input)](docs/test-suite-a/testinterfaceextendingotherinterfaces-testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

### Call Signatures

| CallSignature | Description |
| - | - |
| [(event: 'testCallSignature', listener: (input: unknown) => void): any](docs/test-suite-a/testinterface-_call_-callsignature) | Test interface event call signature |
| [(event: 'anotherTestCallSignature', listener: (input: number) => string): number](docs/test-suite-a/testinterface-_call__1-callsignature) | Another example call signature |

<h3 id="testinterfaceextendingotherinterfaces-see-also">See Also</h3>

- [TestInterface](docs/test-suite-a/testinterface-interface)
- [TestInterfaceWithTypeParameter](docs/test-suite-a/testinterfacewithtypeparameter-interface)
- [TestMappedType](docs/test-suite-a/testmappedtype-typealias)
