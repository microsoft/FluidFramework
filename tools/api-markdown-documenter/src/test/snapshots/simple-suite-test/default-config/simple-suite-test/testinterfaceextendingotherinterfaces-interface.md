
# TestInterfaceExtendingOtherInterfaces

[(model)](./index) &gt; [simple-suite-test](./simple-suite-test)

Test interface that extends other interfaces

## Remarks {#testinterfaceextendingotherinterfaces-remarks}

Here are some remarks about the interface

## Signature {#testinterfaceextendingotherinterfaces-signature}

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestInterfaceWithTypeParameter<number>, TestMappedType 
```
<b>Extends:</b> [TestInterface](./simple-suite-test/testinterface-interface)

, [TestInterfaceWithTypeParameter](./simple-suite-test/testinterfacewithtypeparameter-interface)<!-- -->&lt;number&gt;

, [TestMappedType](./simple-suite-test#testmappedtype-typealias)


## Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testMethod(input)](./simple-suite-test/testinterfaceextendingotherinterfaces-interface#testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

## Method Details

### testMethod {#testmethod-methodsignature}

Test interface method accepting a string and returning a number.

#### Remarks {#testmethod-remarks}

Here are some remarks about the method

#### Signature {#testmethod-signature}

```typescript
testMethod(input: string): number;
```

#### Parameters {#testmethod-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | string | A string |

