
# TestClass

[(model)](./index) &gt; [simple-suite-test](./simple-suite-test)

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
|  [(constructor)(testClassProperty, testClassEventProperty)](./simple-suite-test/testclass-class#_constructor_-constructor) |  |  | Test class constructor |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](./simple-suite-test/testclass-class#testclasseventproperty-property) |  | () =&gt; void | Test class event property |
|  [testClassGetterProperty](./simple-suite-test/testclass-class#testclassgetterproperty-property) |  | number | Test class getter-only property |
|  [testClassProperty](./simple-suite-test/testclass-class#testclassproperty-property) |  | TTypeParameterB | Test class property |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testClassMethod(input)](./simple-suite-test/testclass-class#testclassmethod-method) |  | TTypeParameterA | Test class method |

## Constructor Details

### (constructor) {#_constructor_-constructor}

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
|  testClassProperty | TTypeParameterB | See [TestClass.testClassProperty](./simple-suite-test/testclass-class#testclassproperty-property) |
|  testClassEventProperty | () =&gt; void | See [TestClass.testClassEventProperty](./simple-suite-test/testclass-class#testclasseventproperty-property) |

## Property Details

### testClassEventProperty {#testclasseventproperty-property}

Test class event property

#### Remarks

Here are some remarks about the property

#### Signature

```typescript
readonly testClassEventProperty: () => void;
```

### testClassGetterProperty {#testclassgetterproperty-property}

Test class getter-only property

#### Remarks

Here are some remarks about the getter-only property

#### Signature

```typescript
/** @virtual */
get testClassGetterProperty(): number;
```

### testClassProperty {#testclassproperty-property}

Test class property

#### Remarks

Here are some remarks about the property

#### Signature

```typescript
readonly testClassProperty: TTypeParameterB;
```

## Method Details

### testClassMethod {#testclassmethod-method}

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

