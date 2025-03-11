# TestClass

[Packages](/) &gt; [test-suite-a](/test-suite-a/) &gt; [TestClass](/test-suite-a/testclass-class)

Test class

## Signature {#testclass-signature}

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass
```

**Extends:** [TestAbstractClass](/test-suite-a/testabstractclass-class)

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
| [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](/test-suite-a/testclass-class#_constructor_-constructor) | Test class constructor |

## Static Properties

| Property | Type | Description |
| --- | --- | --- |
| [testClassStaticProperty](/test-suite-a/testclass-class#testclassstaticproperty-property) | (foo: number) =&gt; string | Test static class property |

## Static Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testClassStaticMethod(foo)](/test-suite-a/testclass-class#testclassstaticmethod-method) | string | Test class static method |

## Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](/test-suite-a/testclass-class#testclasseventproperty-property) | `readonly` | () =&gt; void | Test class event property |

## Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [abstractPropertyGetter](/test-suite-a/testclass-class#abstractpropertygetter-property) | `readonly` | [TestMappedType](/test-suite-a/testmappedtype-typealias) | A test abstract getter property. |
| [testClassGetterProperty](/test-suite-a/testclass-class#testclassgetterproperty-property) | `virtual` | number | Test class property with both a getter and a setter. |
| [testClassProperty](/test-suite-a/testclass-class#testclassproperty-property) | `readonly` | TTypeParameterB | Test class property |

## Methods

| Method | Modifiers | Return Type | Description |
| --- | --- | --- | --- |
| [publicAbstractMethod()](/test-suite-a/testclass-class#publicabstractmethod-method) |  | void | A test public abstract method. |
| [testClassMethod(input)](/test-suite-a/testclass-class#testclassmethod-method) | `sealed` | TTypeParameterA | Test class method |
| [virtualMethod()](/test-suite-a/testclass-class#virtualmethod-method) |  | number | Overrides [virtualMethod()](/test-suite-a/testabstractclass-class#virtualmethod-method). |

## Constructor Details

### (constructor) {#\_constructor\_-constructor}

Test class constructor

#### Signature {#\_constructor\_-signature}

```typescript
constructor(privateProperty: number, protectedProperty: TestEnum, testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

#### Remarks {#\_constructor\_-remarks}

Here are some remarks about the constructor

#### Parameters {#\_constructor\_-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| privateProperty | number | See [TestAbstractClass](/test-suite-a/testabstractclass-class)'s constructor. |
| protectedProperty | [TestEnum](/test-suite-a/testenum-enum) | <p>Some notes about the parameter.</p><p>See <a href="/test-suite-a/testabstractclass-class#protectedproperty-property">protectedProperty</a>.</p> |
| testClassProperty | TTypeParameterB | See [testClassProperty](/test-suite-a/testclass-class#testclassproperty-property). |
| testClassEventProperty | () =&gt; void | See [testClassEventProperty](/test-suite-a/testclass-class#testclasseventproperty-property). |

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

**Type:** [TestMappedType](/test-suite-a/testmappedtype-typealias)

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

Overrides [virtualMethod()](/test-suite-a/testabstractclass-class#virtualmethod-method).

#### Signature {#virtualmethod-signature}

```typescript
/** @override */
protected virtualMethod(): number;
```

#### Returns {#virtualmethod-returns}

**Return type:** number

## See Also {#testclass-see-also}

[TestAbstractClass](/test-suite-a/testabstractclass-class)
