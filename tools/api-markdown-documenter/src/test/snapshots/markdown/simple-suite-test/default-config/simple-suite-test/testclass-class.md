<!-- Front Matter! -->

# TestClass

[Packages](./) &gt; [simple-suite-test](./simple-suite-test) &gt; [TestClass](./simple-suite-test/testclass-class)

Test class

## Signature {#testclass-signature}

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass
```

**Extends:** [TestAbstractClass](./simple-suite-test/testabstractclass-class)

### Type Parameters

| Parameter | Description |
| --- | --- |
| TTypeParameterA | A type parameter |
| TTypeParameterB | Another type parameter |

## Remarks {#testclass-remarks}

Here are some remarks about the class

## Constructors

| Constructor | Description |
| --- | --- |
| [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](./simple-suite-test/testclass-class#_constructor_-constructor) | Test class constructor |

## Static Properties

| Property | Type | Description |
| --- | --- | --- |
| [testClassStaticProperty](./simple-suite-test/testclass-class#testclassstaticproperty-property) | (foo: number) =&gt; string | Test static class property |

## Static Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testClassStaticMethod(foo)](./simple-suite-test/testclass-class#testclassstaticmethod-method) | string | Test class static method |

## Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](./simple-suite-test/testclass-class#testclasseventproperty-property) | `readonly` | () =&gt; void | Test class event property |

## Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [abstractPropertyGetter](./simple-suite-test/testclass-class#abstractpropertygetter-property) | `readonly` | [TestMappedType](./simple-suite-test#testmappedtype-typealias) | A test abstract getter property. |
| [testClassGetterProperty](./simple-suite-test/testclass-class#testclassgetterproperty-property) | `virtual` | number | Test class property with both a getter and a setter. |
| [testClassProperty](./simple-suite-test/testclass-class#testclassproperty-property) | `readonly` | TTypeParameterB | Test class property |

## Methods

| Method | Modifiers | Return Type | Description |
| --- | --- | --- | --- |
| [publicAbstractMethod()](./simple-suite-test/testclass-class#publicabstractmethod-method) |  | void | A test public abstract method. |
| [testClassMethod(input)](./simple-suite-test/testclass-class#testclassmethod-method) | `sealed` | TTypeParameterA | Test class method |
| [virtualMethod()](./simple-suite-test/testclass-class#virtualmethod-method) |  | number | Overrides [virtualMethod()](./simple-suite-test/testabstractclass-class#virtualmethod-method). |

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

| Parameter | Type | Description |
| --- | --- | --- |
| privateProperty | number | See [TestAbstractClass](./simple-suite-test/testabstractclass-class)'s constructor. |
| protectedProperty | [TestEnum](./simple-suite-test#testenum-enum) | <p>Some notes about the parameter.</p><p>See <a href='./simple-suite-test/testabstractclass-class#protectedproperty-property'>protectedProperty</a>.</p> |
| testClassProperty | TTypeParameterB | See [testClassProperty](./simple-suite-test/testclass-class#testclassproperty-property). |
| testClassEventProperty | () =&gt; void | See [testClassEventProperty](./simple-suite-test/testclass-class#testclasseventproperty-property). |

## Event Details

### testClassEventProperty {#testclasseventproperty-property}

Test class event property

#### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

**Type:** () =&gt; void

#### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the property

## Property Details

### abstractPropertyGetter {#abstractpropertygetter-property}

A test abstract getter property.

#### Signature {#abstractpropertygetter-signature}

```typescript
get abstractPropertyGetter(): TestMappedType;
```

**Type:** [TestMappedType](./simple-suite-test#testmappedtype-typealias)

### testClassGetterProperty {#testclassgetterproperty-property}

Test class property with both a getter and a setter.

#### Signature {#testclassgetterproperty-signature}

```typescript
/** @virtual */
get testClassGetterProperty(): number;
set testClassGetterProperty(newValue: number);
```

**Type:** number

#### Remarks {#testclassgetterproperty-remarks}

Here are some remarks about the getter-only property

### testClassProperty {#testclassproperty-property}

Test class property

#### Signature {#testclassproperty-signature}

```typescript
readonly testClassProperty: TTypeParameterB;
```

**Type:** TTypeParameterB

#### Remarks {#testclassproperty-remarks}

Here are some remarks about the property

### testClassStaticProperty {#testclassstaticproperty-property}

Test static class property

#### Signature {#testclassstaticproperty-signature}

```typescript
static testClassStaticProperty: (foo: number) => string;
```

**Type:** (foo: number) =&gt; string

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

| Parameter | Type | Description |
| --- | --- | --- |
| input | TTypeParameterA |  |

#### Returns {#testclassmethod-returns}

**Return type:** TTypeParameterA

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

| Parameter | Type | Description |
| --- | --- | --- |
| foo | number | Some number |

#### Returns {#testclassstaticmethod-returns}

- Some string

**Return type:** string

### virtualMethod {#virtualmethod-method}

Overrides [virtualMethod()](./simple-suite-test/testabstractclass-class#virtualmethod-method).

#### Signature {#virtualmethod-signature}

```typescript
/** @override */
protected virtualMethod(): number;
```

#### Returns {#virtualmethod-returns}

**Return type:** number

## See Also {#testclass-see-also}

[TestAbstractClass](./simple-suite-test/testabstractclass-class)
