# TestInterfaceExtendingOtherInterfaces

[Packages](./) &gt; [simple-suite-test](./simple-suite-test) &gt; [TestInterfaceExtendingOtherInterfaces](./simple-suite-test/testinterfaceextendingotherinterfaces-interface)

Test interface that extends other interfaces

## Signature {#testinterfaceextendingotherinterfaces-signature}

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestMappedType, TestInterfaceWithTypeParameter<number> 
```
<b>Extends:</b> [TestInterface](./simple-suite-test/testinterface-interface)<!-- -->, [TestMappedType](./simple-suite-test#testmappedtype-typealias)<!-- -->, [TestInterfaceWithTypeParameter](./simple-suite-test/testinterfacewithtypeparameter-interface)

## Remarks {#testinterfaceextendingotherinterfaces-remarks}

Here are some remarks about the interface

## Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testMethod(input)](./simple-suite-test/testinterfaceextendingotherinterfaces-interface#testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

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

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | string | A string |

#### Returns {#testmethod-returns}

A number

<b>Return type:</b> number

## See also {#testinterfaceextendingotherinterfaces-see-also}

- [TestInterface](./simple-suite-test/testinterface-interface)

- [TestInterfaceWithTypeParameter](./simple-suite-test/testinterfacewithtypeparameter-interface)

- [TestMappedType](./simple-suite-test#testmappedtype-typealias)