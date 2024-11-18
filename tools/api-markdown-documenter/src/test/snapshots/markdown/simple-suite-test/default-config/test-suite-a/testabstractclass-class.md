# TestAbstractClass

[Packages](./) &gt; [test-suite-a](./test-suite-a) &gt; [TestAbstractClass](./test-suite-a/testabstractclass-class)

A test abstract class.

## Signature {#testabstractclass-signature}

```typescript
export declare abstract class TestAbstractClass
```

## Constructors

| Constructor | Description |
| --- | --- |
| [(constructor)(privateProperty, protectedProperty)](./test-suite-a/testabstractclass-class#_constructor_-constructor) | This is a _{@customTag constructor}_. |

## Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [abstractPropertyGetter](./test-suite-a/testabstractclass-class#abstractpropertygetter-property) | `readonly` | [TestMappedType](./test-suite-a#testmappedtype-typealias) | A test abstract getter property. |
| [protectedProperty](./test-suite-a/testabstractclass-class#protectedproperty-property) | `readonly` | [TestEnum](./test-suite-a#testenum-enum) | A test protected property. |

## Methods

| Method | Modifiers | Return Type | Description |
| --- | --- | --- | --- |
| [publicAbstractMethod()](./test-suite-a/testabstractclass-class#publicabstractmethod-method) |  | void | A test public abstract method. |
| [sealedMethod()](./test-suite-a/testabstractclass-class#sealedmethod-method) | `sealed` | string | A test `@sealed` method. |
| [virtualMethod()](./test-suite-a/testabstractclass-class#virtualmethod-method) | `virtual` | number | A test `@virtual` method. |

## Constructor Details

### (constructor) {#\_constructor\_-constructor}

This is a _{@customTag constructor}_.

#### Signature {#\_constructor\_-signature}

```typescript
protected constructor(privateProperty: number, protectedProperty: TestEnum);
```

#### Parameters {#\_constructor\_-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| privateProperty | number |  |
| protectedProperty | [TestEnum](./test-suite-a#testenum-enum) |  |

## Property Details

### abstractPropertyGetter {#abstractpropertygetter-property}

A test abstract getter property.

#### Signature {#abstractpropertygetter-signature}

```typescript
abstract get abstractPropertyGetter(): TestMappedType;
```

**Type:** [TestMappedType](./test-suite-a#testmappedtype-typealias)

### protectedProperty {#protectedproperty-property}

A test protected property.

#### Signature {#protectedproperty-signature}

```typescript
protected readonly protectedProperty: TestEnum;
```

**Type:** [TestEnum](./test-suite-a#testenum-enum)

## Method Details

### publicAbstractMethod {#publicabstractmethod-method}

A test public abstract method.

#### Signature {#publicabstractmethod-signature}

```typescript
abstract publicAbstractMethod(): void;
```

### sealedMethod {#sealedmethod-method}

A test `@sealed` method.

#### Signature {#sealedmethod-signature}

```typescript
/** @sealed */
protected sealedMethod(): string;
```

#### Returns {#sealedmethod-returns}

A string!

**Return type:** string

### virtualMethod {#virtualmethod-method}

A test `@virtual` method.

#### Signature {#virtualmethod-signature}

```typescript
/** @virtual */
protected virtualMethod(): number;
```

#### Returns {#virtualmethod-returns}

A number!

**Return type:** number
