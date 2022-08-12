
## TestClass

[(model)](/index) &gt; [simple-suite-test](/simple-suite-test)

Test class

## Signature

```typescript
export declare class TestClass<TTypeParameter> 
```
<b>Type parameters:</b> 

\* <b>TTypeParameter</b>: A type parameter


## Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(testClassProperty, testClassEventProperty)](/simple-suite-test/testclass#_constructor_-Constructor) |  |  | Test class constructor |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](/simple-suite-test/testclass#testclasseventproperty-Property) |  | () =&gt; void | Test class event property |
|  [testClassGetterProperty](/simple-suite-test/testclass#testclassgetterproperty-Property) |  | number | Test class getter-only property |
|  [testClassProperty](/simple-suite-test/testclass#testclassproperty-Property) |  | number | Test class property |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testClassMethod(input)](/simple-suite-test/testclass#testclassmethod-Method) |  | TTypeParameter | Test class method |

## Details

## Constructor Details

## (constructor)

Test class constructor

## Signature

```typescript
constructor(testClassProperty: number, testClassEventProperty: () => void);
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testClassProperty | number | See  |
|  testClassEventProperty | () =&gt; void |  |

## Property Details

## testClassEventProperty

Test class event property

## Signature

```typescript
readonly testClassEventProperty: () => void;
```

## testClassGetterProperty

Test class getter-only property

## Signature

```typescript
get testClassGetterProperty(): number;
```

## testClassProperty

Test class property

## Signature

```typescript
readonly testClassProperty: number;
```

## Method Details

## testClassMethod

Test class method

## Signature

```typescript
testClassMethod(input: TTypeParameter): TTypeParameter;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | TTypeParameter |  |

