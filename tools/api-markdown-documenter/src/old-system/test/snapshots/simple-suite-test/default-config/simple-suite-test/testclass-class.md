# TestClass

[Packages](./) &gt; [simple-suite-test](./simple-suite-test) &gt; [TestClass](./simple-suite-test/testclass-class)

Test class

## Signature {#testclass-signature}

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass 
```
<b>Extends:</b> [TestAbstractClass](./simple-suite-test/testabstractclass-class)

<b>Type parameters:</b> 

* <b>TTypeParameterA</b>: A type parameter


* <b>TTypeParameterB</b>: Another type parameter


## Remarks {#testclass-remarks}

Here are some remarks about the class

## Constructors

|  Constructor | Description |
|  --- | --- |
|  [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](./simple-suite-test/testclass-class#_constructor_-constructor) | Test class constructor |

## Static Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [testClassStaticProperty](./simple-suite-test/testclass-class#testclassstaticproperty-property) | (foo: number) =&gt; string | Test static class property |

## Static Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testClassStaticMethod(foo)](./simple-suite-test/testclass-class#testclassstaticmethod-method) | string | Test class static method |

## Events

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](./simple-suite-test/testclass-class#testclasseventproperty-property) | <code>readonly</code> | () =&gt; void | Test class event property |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [abstractPropertyGetter](./simple-suite-test/testclass-class#abstractpropertygetter-property) | <code>readonly</code> | [TestMappedType](./simple-suite-test#testmappedtype-typealias) | A test abstract getter property. |
|  [testClassGetterProperty](./simple-suite-test/testclass-class#testclassgetterproperty-property) | <code>readonly</code>, <code>virtual</code> | number | Test class getter-only property |
|  [testClassProperty](./simple-suite-test/testclass-class#testclassproperty-property) | <code>readonly</code> | TTypeParameterB | Test class property |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [publicAbstractMethod()](./simple-suite-test/testclass-class#publicabstractmethod-method) |  | void | A test public abstract method. |
|  [testClassMethod(input)](./simple-suite-test/testclass-class#testclassmethod-method) | <code>sealed</code> | TTypeParameterA | Test class method |
|  [virtualMethod()](./simple-suite-test/testclass-class#virtualmethod-method) |  | number | Overrides [TestAbstractClass.virtualMethod()](./simple-suite-test/testabstractclass-class#virtualmethod-method)<!-- -->. |

## Constructor Details

### (constructor) {#_constructor_-constructor}

Test class constructor

#### Signature {#_constructor_-signature}

```typescript
constructor(privateProperty: number, protectedProperty: TestEnum, testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

#### Remarks {#_constructor_-remarks}

Here are some remarks about the constructor

#### Parameters {#_constructor_-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  privateProperty | number | See [TestAbstractClass](./simple-suite-test/testabstractclass-class)<!-- -->'s constructor. |
|  protectedProperty | [TestEnum](./simple-suite-test#testenum-enum) | See [TestAbstractClass.protectedProperty](./simple-suite-test/testabstractclass-class#protectedproperty-property)<!-- -->. |
|  testClassProperty | TTypeParameterB | See [TestClass.testClassProperty](./simple-suite-test/testclass-class#testclassproperty-property)<!-- -->. |
|  testClassEventProperty | () =&gt; void | See [TestClass.testClassEventProperty](./simple-suite-test/testclass-class#testclasseventproperty-property)<!-- -->. |

## Event Details

### testClassEventProperty {#testclasseventproperty-property}

Test class event property

#### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

#### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the property

## Property Details

### abstractPropertyGetter {#abstractpropertygetter-property}

A test abstract getter property.

#### Signature {#abstractpropertygetter-signature}

```typescript
get abstractPropertyGetter(): TestMappedType;
```

### testClassGetterProperty {#testclassgetterproperty-property}

Test class getter-only property

#### Signature {#testclassgetterproperty-signature}

```typescript
/** @virtual */
get testClassGetterProperty(): number;
```

#### Remarks {#testclassgetterproperty-remarks}

Here are some remarks about the getter-only property

### testClassProperty {#testclassproperty-property}

Test class property

#### Signature {#testclassproperty-signature}

```typescript
readonly testClassProperty: TTypeParameterB;
```

#### Remarks {#testclassproperty-remarks}

Here are some remarks about the property

### testClassStaticProperty {#testclassstaticproperty-property}

Test static class property

#### Signature {#testclassstaticproperty-signature}

```typescript
static testClassStaticProperty: (foo: number) => string;
```

## Method Details

### publicAbstractMethod {#publicabstractmethod-method}

A test public abstract method.

#### Signature {#publicabstractmethod-signature}

```typescript
publicAbstractMethod(): void;
```

### testClassMethod {#testclassmethod-method}

Test class method

#### Signature {#testclassmethod-signature}

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

#### Remarks {#testclassmethod-remarks}

Here are some remarks about the method

#### Parameters {#testclassmethod-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | TTypeParameterA |  |

#### Returns {#testclassmethod-returns}

<b>Return type:</b> TTypeParameterA

#### Throws {#testclassmethod-throws}

Some sort of error in 1 case.

Some other sort of error in another case. For example, a case where some thing happens.

### testClassStaticMethod {#testclassstaticmethod-method}

Test class static method

#### Signature {#testclassstaticmethod-signature}

```typescript
static testClassStaticMethod(foo: number): string;
```

#### Parameters {#testclassstaticmethod-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  foo | number | Some number |

#### Returns {#testclassstaticmethod-returns}

- Some string

<b>Return type:</b> string

### virtualMethod {#virtualmethod-method}

Overrides [TestAbstractClass.virtualMethod()](./simple-suite-test/testabstractclass-class#virtualmethod-method)<!-- -->.

#### Signature {#virtualmethod-signature}

```typescript
/** @override */
protected virtualMethod(): number;
```

#### Returns {#virtualmethod-returns}

<b>Return type:</b> number

## See also {#testclass-see-also}

[TestAbstractClass](./simple-suite-test/testabstractclass-class)