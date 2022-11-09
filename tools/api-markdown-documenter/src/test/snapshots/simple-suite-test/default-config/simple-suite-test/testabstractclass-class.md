# TestAbstractClass

[Packages](./) &gt; [simple-suite-test](./simple-suite-test) &gt; [TestAbstractClass](./simple-suite-test/testabstractclass-class)

A test abstract class.

## Signature {#testabstractclass-signature}

```typescript
export declare abstract class TestAbstractClass 
```

## Constructors

|  Constructor | Description |
|  --- | --- |
|  [(constructor)(privateProperty, protectedProperty)](./simple-suite-test/testabstractclass-class#_constructor_-constructor) | This is a constructor. |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [abstractPropertyGetter](./simple-suite-test/testabstractclass-class#abstractpropertygetter-property) | <code>readonly</code> | [TestMappedType](./simple-suite-test#testmappedtype-typealias) | A test abstract getter property. |
|  [protectedProperty](./simple-suite-test/testabstractclass-class#protectedproperty-property) | <code>readonly</code> | [TestEnum](./simple-suite-test#testenum-enum) | A test protected property. |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [publicAbstractMethod()](./simple-suite-test/testabstractclass-class#publicabstractmethod-method) |  | void | A test public abstract method. |
|  [sealedMethod()](./simple-suite-test/testabstractclass-class#sealedmethod-method) | <code>sealed</code> | string | A test <code>@sealed</code> method. |
|  [virtualMethod()](./simple-suite-test/testabstractclass-class#virtualmethod-method) | <code>virtual</code> | number | A test <code>@virtual</code> method. |

## Constructor Details

### (constructor) {#_constructor_-constructor}

This is a constructor.

#### Signature {#_constructor_-signature}

```typescript
protected constructor(privateProperty: number, protectedProperty: TestEnum);
```

#### Parameters {#_constructor_-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  privateProperty | number |  |
|  protectedProperty | [TestEnum](./simple-suite-test#testenum-enum) |  |

## Property Details

### abstractPropertyGetter {#abstractpropertygetter-property}

A test abstract getter property.

#### Signature {#abstractpropertygetter-signature}

```typescript
abstract get abstractPropertyGetter(): TestMappedType;
```

### protectedProperty {#protectedproperty-property}

A test protected property.

#### Signature {#protectedproperty-signature}

```typescript
protected readonly protectedProperty: TestEnum;
```

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

<b>Return type:</b> string

### virtualMethod {#virtualmethod-method}

A test `@virtual` method.

#### Signature {#virtualmethod-signature}

```typescript
/** @virtual */
protected virtualMethod(): number;
```

#### Returns {#virtualmethod-returns}

A number!

<b>Return type:</b> number