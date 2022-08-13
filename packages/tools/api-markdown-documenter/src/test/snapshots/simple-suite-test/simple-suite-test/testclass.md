
# TestClass

[(model)](docs/index) &gt; [simple-suite-test](docs/simple-suite-test)

Test class

## Remarks

Here are some remarks about the class

## Signature

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> 
```
<b>Type parameters:</b> 

\* <b>TTypeParameterA</b>: A type parameter


\* <b>TTypeParameterB</b>: Another type parameter


## Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(testClassProperty, testClassEventProperty)](docs/simple-suite-test/testclass#_constructor_-Constructor) |  |  | Test class constructor |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test/testclass#testclasseventproperty-Property) |  | () =&gt; void | Test class event property |
|  [testClassGetterProperty](docs/simple-suite-test/testclass#testclassgetterproperty-Property) |  | number | Test class getter-only property |
|  [testClassProperty](docs/simple-suite-test/testclass#testclassproperty-Property) |  | TTypeParameterB | Test class property |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testClassMethod(input)](docs/simple-suite-test/testclass#testclassmethod-Method) |  | TTypeParameterA | Test class method |

## Constructor Details

### (constructor) {#_constructor_-Constructor}

Test class constructor

#### Remarks

Here are some remarks about the constructor

#### Signature

```typescript
constructor(testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testClassProperty | TTypeParameterB | See [TestClass.testClassProperty](docs/simple-suite-test/testclass#testclassproperty-Property) |
|  testClassEventProperty | () =&gt; void | See [TestClass.testClassEventProperty](docs/simple-suite-test/testclass#testclasseventproperty-Property) |

## Property Details

### testClassEventProperty {#testclasseventproperty-Property}

Test class event property

#### Remarks

Here are some remarks about the property

#### Signature

```typescript
readonly testClassEventProperty: () => void;
```

### testClassGetterProperty {#testclassgetterproperty-Property}

Test class getter-only property

#### Remarks

Here are some remarks about the getter-only property

#### Signature

```typescript
/** @virtual */
get testClassGetterProperty(): number;
```

### testClassProperty {#testclassproperty-Property}

Test class property

#### Remarks

Here are some remarks about the property

#### Signature

```typescript
readonly testClassProperty: TTypeParameterB;
```

## Method Details

### testClassMethod {#testclassmethod-Method}

Test class method

#### Remarks

Here are some remarks about the method

#### Signature

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | TTypeParameterA |  |

