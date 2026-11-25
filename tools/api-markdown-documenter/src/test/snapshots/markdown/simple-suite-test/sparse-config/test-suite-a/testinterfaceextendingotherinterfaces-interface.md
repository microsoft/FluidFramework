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

| Property | Inherited From | Modifiers | Type | Description |
| - | - | - | - | - |
| [testClassEventProperty](docs/test-suite-a/testinterface-testclasseventproperty-propertysignature) | [TestInterface](docs/test-suite-a/testinterface-interface) | `readonly` | () => void | Test interface event property |

### Properties

| Property | Inherited From | Modifiers | Default Value | Type | Description |
| - | - | - | - | - | - |
| [getterProperty](docs/test-suite-a/testinterface-getterproperty-property) | [TestInterface](docs/test-suite-a/testinterface-interface) | `readonly` | | boolean | A test getter-only interface property. |
| [propertyWithBadInheritDocTarget](docs/test-suite-a/testinterface-propertywithbadinheritdoctarget-propertysignature) | [TestInterface](docs/test-suite-a/testinterface-interface) | | | boolean | |
| [setterProperty](docs/test-suite-a/testinterface-setterproperty-property) | [TestInterface](docs/test-suite-a/testinterface-interface) | | | boolean | A test property with a getter and a setter. |
| [testInterfaceProperty](docs/test-suite-a/testinterface-testinterfaceproperty-propertysignature) | [TestInterface](docs/test-suite-a/testinterface-interface) | | | number | Test interface property |
| [testOptionalInterfaceProperty](docs/test-suite-a/testinterface-testoptionalinterfaceproperty-propertysignature) | [TestInterface](docs/test-suite-a/testinterface-interface) | `optional` | 0 | number | Test optional property |
| [testProperty](docs/test-suite-a/testinterfacewithtypeparameter-testproperty-propertysignature) | [TestInterfaceWithTypeParameter](docs/test-suite-a/testinterfacewithtypeparameter-interface) | | | number | A test interface property using generic type parameter |

### Methods

| Method | Inherited From | Return Type | Description |
| - | - | - | - |
| [testInterfaceMethod()](docs/test-suite-a/testinterface-testinterfacemethod-methodsignature) | [TestInterface](docs/test-suite-a/testinterface-interface) | void | Test interface method |
| [testMethod(input)](docs/test-suite-a/testinterfaceextendingotherinterfaces-testmethod-methodsignature) | | number | Test interface method accepting a string and returning a number. |

<h3 id="testinterfaceextendingotherinterfaces-see-also">See Also</h3>

- [TestInterface](docs/test-suite-a/testinterface-interface)
- [TestInterfaceWithTypeParameter](docs/test-suite-a/testinterfacewithtypeparameter-interface)
- [TestMappedType](docs/test-suite-a/testmappedtype-typealias)
