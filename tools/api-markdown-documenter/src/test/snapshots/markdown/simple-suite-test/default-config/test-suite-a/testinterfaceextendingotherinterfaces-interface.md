# TestInterfaceExtendingOtherInterfaces

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestInterfaceExtendingOtherInterfaces](/test-suite-a/testinterfaceextendingotherinterfaces-interface)

Test interface that extends other interfaces

<a id="testinterfaceextendingotherinterfaces-signature"></a>

## Signature

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestMappedType, TestInterfaceWithTypeParameter<number>
```

**Extends**: [TestInterface](/test-suite-a/testinterface-interface), [TestMappedType](/test-suite-a/testmappedtype-typealias), [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface)\<number>

<a id="testinterfaceextendingotherinterfaces-remarks"></a>

## Remarks

Here are some remarks about the interface

## Methods

| Method | Return Type | Description |
| - | - | - |
| [testMethod(input)](/test-suite-a/testinterfaceextendingotherinterfaces-interface#testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

## Method Details

<a id="testmethod-methodsignature"></a>

### testMethod

Test interface method accepting a string and returning a number.

<a id="testmethod-signature"></a>

#### Signature

```typescript
testMethod(input: string): number;
```

<a id="testmethod-remarks"></a>

#### Remarks

Here are some remarks about the method

<a id="testmethod-parameters"></a>

#### Parameters

| Parameter | Type | Description |
| - | - | - |
| input | string | A string |

<a id="testmethod-returns"></a>

#### Returns

A number

**Return type**: number

<a id="testinterfaceextendingotherinterfaces-see-also"></a>

## See Also

- [TestInterface](/test-suite-a/testinterface-interface)
- [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface)
- [TestMappedType](/test-suite-a/testmappedtype-typealias)
