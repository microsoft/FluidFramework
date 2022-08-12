
# TestClass

[(model)](docs/index) &gt; [simple-suite-test](docs/simple-suite-test)

Test class

### Remarks

Here are some remarks about the class

### Signature

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> 
```
<b>Type parameters:</b> 

\* <b>TTypeParameterA</b>: A type parameter


\* <b>TTypeParameterB</b>: Another type parameter


#### Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(testClassProperty, testClassEventProperty)](docs/simple-suite-test/testclass#_constructor_-Constructor) |  |  | Test class constructor |

#### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test/testclass#testclasseventproperty-Property) |  | () =&gt; void | Test class event property |
|  [testClassGetterProperty](docs/simple-suite-test/testclass#testclassgetterproperty-Property) |  | number | Test class getter-only property |
|  [testClassProperty](docs/simple-suite-test/testclass#testclassproperty-Property) |  | TTypeParameterB | Test class property |

#### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testClassMethod(input)](docs/simple-suite-test/testclass#testclassmethod-Method) |  | TTypeParameterA | Test class method |

### Details

##### Constructor Details

<b>(constructor)</b>

Test class constructor

<b>Remarks</b>

Here are some remarks about the constructor

<b>Signature</b>

```typescript
constructor(testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

<b>Parameters</b>

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testClassProperty | TTypeParameterB | See [TestClass.testClassProperty](simple-suite-test/testclass.md) |
|  testClassEventProperty | () =&gt; void | See [TestClass.testClassEventProperty](simple-suite-test/testclass.md) |

##### Property Details

<b>testClassEventProperty</b>

Test class event property

<b>Remarks</b>

Here are some remarks about the property

<b>Signature</b>

```typescript
readonly testClassEventProperty: () => void;
```

<b>testClassGetterProperty</b>

Test class getter-only property

<b>Remarks</b>

Here are some remarks about the getter-only property

<b>Signature</b>

```typescript
/** @virtual */
get testClassGetterProperty(): number;
```

<b>testClassProperty</b>

Test class property

<b>Remarks</b>

Here are some remarks about the property

<b>Signature</b>

```typescript
readonly testClassProperty: TTypeParameterB;
```

##### Method Details

<b>testClassMethod</b>

Test class method

<b>Remarks</b>

Here are some remarks about the method

<b>Signature</b>

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

<b>Parameters</b>

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | TTypeParameterA |  |

