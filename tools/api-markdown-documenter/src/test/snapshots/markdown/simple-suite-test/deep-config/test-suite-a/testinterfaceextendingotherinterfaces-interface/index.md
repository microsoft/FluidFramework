# TestInterfaceExtendingOtherInterfaces

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestInterfaceExtendingOtherInterfaces](/test-suite-a/testinterfaceextendingotherinterfaces-interface/)

Test interface that extends other interfaces

<h2 id="testinterfaceextendingotherinterfaces-signature">Signature</h2>

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestMappedType, TestInterfaceWithTypeParameter<number>
```

**Extends**: [TestInterface](/test-suite-a/testinterface-interface/), [TestMappedType](/test-suite-a/testmappedtype-typealias/), [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface/)\<number>

<h2 id="testinterfaceextendingotherinterfaces-remarks">Remarks</h2>

Here are some remarks about the interface

## Events

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [testClassEventProperty](/test-suite-a/testinterface-interface/testclasseventproperty-propertysignature) | `readonly` | () => void | Test interface event property |

## Properties

| Property | Modifiers | Default Value | Type | Description |
| - | - | - | - | - |
| [getterProperty](/test-suite-a/testinterface-interface/getterproperty-property) | `readonly` | | boolean | A test getter-only interface property. |
| [propertyWithBadInheritDocTarget](/test-suite-a/testinterface-interface/propertywithbadinheritdoctarget-propertysignature) | | | boolean | |
| [setterProperty](/test-suite-a/testinterface-interface/setterproperty-property) | | | boolean | A test property with a getter and a setter. |
| [testInterfaceProperty](/test-suite-a/testinterface-interface/testinterfaceproperty-propertysignature) | | | number | Test interface property |
| [testOptionalInterfaceProperty](/test-suite-a/testinterface-interface/testoptionalinterfaceproperty-propertysignature) | `optional` | 0 | number | Test optional property |

## Methods

| Method | Return Type | Description |
| - | - | - |
| [testInterfaceMethod()](/test-suite-a/testinterface-interface/testinterfacemethod-methodsignature) | void | Test interface method |
| [testMethod(input)](/test-suite-a/testinterfaceextendingotherinterfaces-interface/testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

## Call Signatures

| Call Signature | Return Type | Description |
| - | - | - |
| [(event: 'testCallSignature', listener: (input: unknown) => void): any](/test-suite-a/testinterface-interface/_call_-callsignature) | any | Test interface event call signature |
| [(event: 'anotherTestCallSignature', listener: (input: number) => string): number](/test-suite-a/testinterface-interface/_call__1-callsignature) | number | Another example call signature |

<h2 id="testinterfaceextendingotherinterfaces-see-also">See Also</h2>

- [TestInterface](/test-suite-a/testinterface-interface/)
- [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface/)
- [TestMappedType](/test-suite-a/testmappedtype-typealias/)
