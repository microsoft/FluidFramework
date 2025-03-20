# TestInterfaceExtendingOtherInterfaces

[Packages](/) &gt; [test-suite-a](/test-suite-a/) &gt; [TestInterfaceExtendingOtherInterfaces](/test-suite-a/testinterfaceextendingotherinterfaces-interface)

Test interface that extends other interfaces

## Signature {#testinterfaceextendingotherinterfaces-signature}

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestMappedType, TestInterfaceWithTypeParameter<number>
```

**Extends:** [TestInterface](/test-suite-a/testinterface-interface), [TestMappedType](/test-suite-a/testmappedtype-typealias), [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface)&lt;number&gt;

## Remarks {#testinterfaceextendingotherinterfaces-remarks}

Here are some remarks about the interface

## Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testMethod(input)](/test-suite-a/testinterfaceextendingotherinterfaces-interface#testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

## Method Details

### testMethod {#testmethod-methodsignature}

Test interface method accepting a string and returning a number.

#### Signature {#testmethod-signature}

```typescript
testMethod(input: string): number;
```

#### Remarks {#testmethod-remarks}

Here are some remarks about the method

#### Parameters {#testmethod-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| input | string | A string |

#### Returns {#testmethod-returns}

A number

**Return type:** number

## See Also {#testinterfaceextendingotherinterfaces-see-also}

- [TestInterface](/test-suite-a/testinterface-interface)

- [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface)

- [TestMappedType](/test-suite-a/testmappedtype-typealias)
