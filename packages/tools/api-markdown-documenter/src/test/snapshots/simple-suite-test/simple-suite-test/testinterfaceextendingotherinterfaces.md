
# TestInterfaceExtendingOtherInterfaces

[(model)](docs/index) &gt; [simple-suite-test](docs/simple-suite-test)

Test interface that extends other interfaces

### Remarks

Here are some remarks about the interface

### Signature

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestInterfaceWithTypeParameter<number>, TestMappedType 
```
<b>Extends:</b> [TestInterface](docs/simple-suite-test/testinterface)

, [TestInterfaceWithTypeParameter](docs/simple-suite-test/testinterfacewithtypeparameter)<!-- -->&lt;number&gt;

, [TestMappedType](docs/simple-suite-test#testmappedtype-TypeAlias)


#### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testMethod(input)](docs/simple-suite-test/testinterfaceextendingotherinterfaces#testmethod-MethodSignature) |  | number | Test interface method accepting a string and returning a number. |

### Details

##### Method Details

<b>testMethod</b>

Test interface method accepting a string and returning a number.

<b>Remarks</b>

Here are some remarks about the method

<b>Signature</b>

```typescript
testMethod(input: string): number;
```

<b>Parameters</b>

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | string | A string |

