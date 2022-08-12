
# TestClass

[(model)](docs/index) &gt; [simple-suite-test](docs/simple-suite-test)

Test class

### Signature

```typescript
export declare class TestClass<TTypeParameter> 
```
<b>Type parameters:</b> 

\* <b>TTypeParameter</b>: A type parameter


##### Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(testClassProperty, testClassEventProperty)](docs/simple-suite-test/testclass#_constructor_-Constructor) |  |  | Test class constructor |

##### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test/testclass#testclasseventproperty-Property) |  | () =&gt; void | Test class event property |
|  [testClassGetterProperty](docs/simple-suite-test/testclass#testclassgetterproperty-Property) |  | number | Test class getter-only property |
|  [testClassProperty](docs/simple-suite-test/testclass#testclassproperty-Property) |  | number | Test class property |

##### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testClassMethod(input)](docs/simple-suite-test/testclass#testclassmethod-Method) |  | TTypeParameter | Test class method |

#### Details

<b>Constructor Details</b>

<b>(constructor)</b>

Test class constructor

<b>Signature</b>

```typescript
constructor(testClassProperty: number, testClassEventProperty: () => void);
```

<b>Parameters</b>

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testClassProperty | number | See [TestClass.testClassProperty](simple-suite-test/testclass.md) |
|  testClassEventProperty | () =&gt; void |  |

<b>Property Details</b>

<b>testClassEventProperty</b>

Test class event property

<b>Signature</b>

```typescript
readonly testClassEventProperty: () => void;
```

<b>testClassGetterProperty</b>

Test class getter-only property

<b>Signature</b>

```typescript
get testClassGetterProperty(): number;
```

<b>testClassProperty</b>

Test class property

<b>Signature</b>

```typescript
readonly testClassProperty: number;
```

<b>Method Details</b>

<b>testClassMethod</b>

Test class method

<b>Signature</b>

```typescript
testClassMethod(input: TTypeParameter): TTypeParameter;
```

<b>Parameters</b>

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | TTypeParameter |  |

