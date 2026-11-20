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

| Property | Inherited From | Modifiers | Type | Description |
| - | - | - | - | - |
| [testClassEventProperty](/test-suite-a/testinterface-interface/testclasseventproperty-propertysignature) | [TestInterface](/test-suite-a/testinterface-interface/) | `readonly` | () => void | Test interface event property |

## Properties

| Property | Inherited From | Modifiers | Default Value | Type | Description |
| - | - | - | - | - | - |
| [getterProperty](/test-suite-a/testinterface-interface/getterproperty-property) | [TestInterface](/test-suite-a/testinterface-interface/) | `readonly` | | boolean | A test getter-only interface property. |
| [propertyWithBadInheritDocTarget](/test-suite-a/testinterface-interface/propertywithbadinheritdoctarget-propertysignature) | [TestInterface](/test-suite-a/testinterface-interface/) | | | boolean | |
| [setterProperty](/test-suite-a/testinterface-interface/setterproperty-property) | [TestInterface](/test-suite-a/testinterface-interface/) | | | boolean | A test property with a getter and a setter. |
| [testInterfaceProperty](/test-suite-a/testinterface-interface/testinterfaceproperty-propertysignature) | [TestInterface](/test-suite-a/testinterface-interface/) | | | number | Test interface property |
| [testOptionalInterfaceProperty](/test-suite-a/testinterface-interface/testoptionalinterfaceproperty-propertysignature) | [TestInterface](/test-suite-a/testinterface-interface/) | `optional` | 0 | number | Test optional property |
| [testProperty](/test-suite-a/testinterfacewithtypeparameter-interface/testproperty-propertysignature) | [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface/) | | | number | A test interface property using generic type parameter |

## Methods

| Method | Inherited From | Return Type | Description |
| - | - | - | - |
| [testInterfaceMethod()](/test-suite-a/testinterface-interface/testinterfacemethod-methodsignature) | [TestInterface](/test-suite-a/testinterface-interface/) | void | Test interface method |
| [testMethod(input)](/test-suite-a/testinterfaceextendingotherinterfaces-interface/testmethod-methodsignature) | | number | Test interface method accepting a string and returning a number. |

<h2 id="testinterfaceextendingotherinterfaces-see-also">See Also</h2>

- [TestInterface](/test-suite-a/testinterface-interface/)
- [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface/)
- [TestMappedType](/test-suite-a/testmappedtype-typealias/)
