# TestInterfaceExtendingOtherInterfaces

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestInterfaceExtendingOtherInterfaces](/test-suite-a/testinterfaceextendingotherinterfaces-interface)

Test interface that extends other interfaces

<h2 id="testinterfaceextendingotherinterfaces-signature">Signature</h2>

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestMappedType, TestInterfaceWithTypeParameter<number>
```

**Extends**: [TestInterface](/test-suite-a/testinterface-interface), [TestMappedType](/test-suite-a/testmappedtype-typealias), [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface)\<number>

<h2 id="testinterfaceextendingotherinterfaces-remarks">Remarks</h2>

Here are some remarks about the interface

## Methods

| Method | Return Type | Description |
| - | - | - |
| [testMethod(input)](/test-suite-a/testinterfaceextendingotherinterfaces-interface#testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

## Method Details

<h3 id="testmethod-methodsignature">testMethod</h3>

Test interface method accepting a string and returning a number.

<h4 id="testmethod-signature">Signature</h4>

```typescript
testMethod(input: string): number;
```

<h4 id="testmethod-remarks">Remarks</h4>

Here are some remarks about the method

<h4 id="testmethod-parameters">Parameters</h4>

| Parameter | Type | Description |
| - | - | - |
| input | string | A string |

<h4 id="testmethod-returns">Returns</h4>

A number

**Return type**: number

<h2 id="testinterfaceextendingotherinterfaces-see-also">See Also</h2>

- [TestInterface](/test-suite-a/testinterface-interface)
- [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface)
- [TestMappedType](/test-suite-a/testmappedtype-typealias)
