# TestAbstractClass

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestAbstractClass](/test-suite-a/testabstractclass-class)

A test abstract class.

<a id="testabstractclass-signature"></a>

## Signature

```typescript
export declare abstract class TestAbstractClass
```

## Constructors

| Constructor | Description |
| - | - |
| [(constructor)(privateProperty, protectedProperty)](/test-suite-a/testabstractclass-class#_constructor_-constructor) | This is a _{@customTag constructor}_. |

## Properties

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [abstractPropertyGetter](/test-suite-a/testabstractclass-class#abstractpropertygetter-property) | `readonly` | [TestMappedType](/test-suite-a/testmappedtype-typealias) | <p>A test abstract getter property.</p><p>@escapedTag</p> |
| [protectedProperty](/test-suite-a/testabstractclass-class#protectedproperty-property) | `readonly` | [TestEnum](/test-suite-a/testenum-enum) | A test protected property. |

## Methods

| Method | Modifiers | Return Type | Description |
| - | - | - | - |
| [publicAbstractMethod()](/test-suite-a/testabstractclass-class#publicabstractmethod-method) | | void | A test public abstract method. |
| [sealedMethod()](/test-suite-a/testabstractclass-class#sealedmethod-method) | `sealed` | string | A test `@sealed` method. |
| [virtualMethod()](/test-suite-a/testabstractclass-class#virtualmethod-method) | `virtual` | number | A test `@virtual` method. |

## Constructor Details

<a id="_constructor_-constructor"></a>

### (constructor)

This is a _{@customTag constructor}_.

<a id="_constructor_-signature"></a>

#### Signature

```typescript
protected constructor(privateProperty: number, protectedProperty: TestEnum);
```

<a id="_constructor_-parameters"></a>

#### Parameters

| Parameter | Type | Description |
| - | - | - |
| privateProperty | number | |
| protectedProperty | [TestEnum](/test-suite-a/testenum-enum) | |

## Property Details

<a id="abstractpropertygetter-property"></a>

### abstractPropertyGetter

A test abstract getter property.

@escapedTag

<a id="abstractpropertygetter-signature"></a>

#### Signature

```typescript
abstract get abstractPropertyGetter(): TestMappedType;
```

**Type**: [TestMappedType](/test-suite-a/testmappedtype-typealias)

<a id="protectedproperty-property"></a>

### protectedProperty

A test protected property.

<a id="protectedproperty-signature"></a>

#### Signature

```typescript
protected readonly protectedProperty: TestEnum;
```

**Type**: [TestEnum](/test-suite-a/testenum-enum)

## Method Details

<a id="publicabstractmethod-method"></a>

### publicAbstractMethod

A test public abstract method.

<a id="publicabstractmethod-signature"></a>

#### Signature

```typescript
abstract publicAbstractMethod(): void;
```

<a id="sealedmethod-method"></a>

### sealedMethod

A test `@sealed` method.

<a id="sealedmethod-signature"></a>

#### Signature

```typescript
/** @sealed */
protected sealedMethod(): string;
```

<a id="sealedmethod-returns"></a>

#### Returns

A string!

**Return type**: string

<a id="virtualmethod-method"></a>

### virtualMethod

A test `@virtual` method.

<a id="virtualmethod-signature"></a>

#### Signature

```typescript
/** @virtual */
protected virtualMethod(): number;
```

<a id="virtualmethod-returns"></a>

#### Returns

A number!

**Return type**: number
