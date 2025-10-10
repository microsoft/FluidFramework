# TestAbstractClass

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestAbstractClass](/test-suite-a/testabstractclass-class)

A test abstract class.

<h2 id="testabstractclass-signature">Signature</h2>

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

<h3 id="_constructor_-constructor">(constructor)</h3>

This is a _{@customTag constructor}_.

<h4 id="_constructor_-signature">Signature</h4>

```typescript
protected constructor(privateProperty: number, protectedProperty: TestEnum);
```

<h4 id="_constructor_-parameters">Parameters</h4>

| Parameter | Type | Description |
| - | - | - |
| privateProperty | number | |
| protectedProperty | [TestEnum](/test-suite-a/testenum-enum) | |

## Property Details

<h3 id="abstractpropertygetter-property">abstractPropertyGetter</h3>

A test abstract getter property.

@escapedTag

<h4 id="abstractpropertygetter-signature">Signature</h4>

```typescript
abstract get abstractPropertyGetter(): TestMappedType;
```

**Type**: [TestMappedType](/test-suite-a/testmappedtype-typealias)

<h3 id="protectedproperty-property">protectedProperty</h3>

A test protected property.

<h4 id="protectedproperty-signature">Signature</h4>

```typescript
protected readonly protectedProperty: TestEnum;
```

**Type**: [TestEnum](/test-suite-a/testenum-enum)

## Method Details

<h3 id="publicabstractmethod-method">publicAbstractMethod</h3>

A test public abstract method.

<h4 id="publicabstractmethod-signature">Signature</h4>

```typescript
abstract publicAbstractMethod(): void;
```

<h3 id="sealedmethod-method">sealedMethod</h3>

A test `@sealed` method.

<h4 id="sealedmethod-signature">Signature</h4>

```typescript
/** @sealed */
protected sealedMethod(): string;
```

<h4 id="sealedmethod-returns">Returns</h4>

A string!

**Return type**: string

<h3 id="virtualmethod-method">virtualMethod</h3>

A test `@virtual` method.

<h4 id="virtualmethod-signature">Signature</h4>

```typescript
/** @virtual */
protected virtualMethod(): number;
```

<h4 id="virtualmethod-returns">Returns</h4>

A number!

**Return type**: number
