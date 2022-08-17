
# TestClass

[(model)](./index) &gt; [simple-suite-test](./simple-suite-test)

Test class

## Remarks {#testclass-remarks}

Here are some remarks about the class

## Signature {#testclass-signature}

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass 
```
<b>Extends:</b> [TestAbstractClass](./simple-suite-test/testabstractclass-class)


<b>Type parameters:</b> 

* <b>TTypeParameterA</b>: A type parameter



* <b>TTypeParameterB</b>: Another type parameter



## Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](./simple-suite-test/testclass-class#_constructor_-constructor) |  |  | Test class constructor |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [abstractPropertyGetter](./simple-suite-test/testclass-class#abstractpropertygetter-property) |  | [TestMappedType](./simple-suite-test#testmappedtype-typealias) | A test abstract getter property. |
|  [testClassEventProperty](./simple-suite-test/testclass-class#testclasseventproperty-property) |  | () =&gt; void | Test class event property |
|  [testClassGetterProperty](./simple-suite-test/testclass-class#testclassgetterproperty-property) |  | number | Test class getter-only property |
|  [testClassProperty](./simple-suite-test/testclass-class#testclassproperty-property) |  | TTypeParameterB | Test class property |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [publicAbstractMethod()](./simple-suite-test/testclass-class#publicabstractmethod-method) |  | void | A test public abstract method. |
|  [testClassMethod(input)](./simple-suite-test/testclass-class#testclassmethod-method) |  | TTypeParameterA | Test class method |
|  [virtualMethod()](./simple-suite-test/testclass-class#virtualmethod-method) |  | number | Overrides [TestAbstractClass.virtualMethod()](./simple-suite-test/testabstractclass-class#virtualmethod-method)<!-- -->. |

## Constructor Details

### (constructor) {#_constructor_-constructor}

Test class constructor

#### Remarks {#_constructor_-remarks}

Here are some remarks about the constructor

#### Signature {#_constructor_-signature}

```typescript
constructor(privateProperty: number, protectedProperty: TestEnum, testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

#### Parameters {#_constructor_-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  privateProperty | number | See [TestAbstractClass](./simple-suite-test/testabstractclass-class)<!-- -->'s constructor. |
|  protectedProperty | [TestEnum](./simple-suite-test#testenum-enum) | See [TestAbstractClass.protectedProperty](./simple-suite-test/testabstractclass-class#protectedproperty-property)<!-- -->. |
|  testClassProperty | TTypeParameterB | See [TestClass.testClassProperty](./simple-suite-test/testclass-class#testclassproperty-property)<!-- -->. |
|  testClassEventProperty | () =&gt; void | See [TestClass.testClassEventProperty](./simple-suite-test/testclass-class#testclasseventproperty-property)<!-- -->. |

## Property Details

### abstractPropertyGetter {#abstractpropertygetter-property}

A test abstract getter property.

#### Signature {#abstractpropertygetter-signature}

```typescript
get abstractPropertyGetter(): TestMappedType;
```

### testClassEventProperty {#testclasseventproperty-property}

Test class event property

#### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the property

#### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

### testClassGetterProperty {#testclassgetterproperty-property}

Test class getter-only property

#### Remarks {#testclassgetterproperty-remarks}

Here are some remarks about the getter-only property

#### Signature {#testclassgetterproperty-signature}

```typescript
/** @virtual */
get testClassGetterProperty(): number;
```

### testClassProperty {#testclassproperty-property}

Test class property

#### Remarks {#testclassproperty-remarks}

Here are some remarks about the property

#### Signature {#testclassproperty-signature}

```typescript
readonly testClassProperty: TTypeParameterB;
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

#### Remarks {#testclassmethod-remarks}

Here are some remarks about the method

#### Signature {#testclassmethod-signature}

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

#### Parameters {#testclassmethod-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | TTypeParameterA |  |

### virtualMethod {#virtualmethod-method}

Overrides [TestAbstractClass.virtualMethod()](./simple-suite-test/testabstractclass-class#virtualmethod-method)<!-- -->.

#### Signature {#virtualmethod-signature}

```typescript
/** @override */
protected virtualMethod(): number;
```
