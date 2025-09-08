# testFunction

[Packages](/) > [test-suite-a](/test-suite-a/) > [testFunction(testParameter, testOptionalParameter)](/test-suite-a/testfunction-function)

Test function

**WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.**

<h2 id="testfunction-signature">Signature</h2>

```typescript
export declare function testFunction<TTypeParameter extends TestInterface = TestInterface>(testParameter: TTypeParameter, testOptionalParameter?: TTypeParameter): TTypeParameter;
```

### Type Parameters

| Parameter | Constraint | Default | Description |
| - | - | - | - |
| TTypeParameter | [TestInterface](/test-suite-a/testinterface-interface/) | [TestInterface](/test-suite-a/testinterface-interface/) | A test type parameter |

<h2 id="testfunction-remarks">Remarks</h2>

This is a test [link](/test-suite-a/testinterface-interface/) to another API member

<h2 id="testfunction-parameters">Parameters</h2>

| Parameter | Modifiers | Type | Description |
| - | - | - | - |
| testParameter | | TTypeParameter | A test parameter |
| testOptionalParameter | optional | TTypeParameter | |

<h2 id="testfunction-returns">Returns</h2>

The provided parameter

**Return type**: TTypeParameter

<h2 id="testfunction-throws">Throws</h2>

An Error when something bad happens.
