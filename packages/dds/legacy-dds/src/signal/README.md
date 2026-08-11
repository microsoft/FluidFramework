# @SharedSignal

## SharedSignal

A DDS created by Loop which we now take ownership. Following README content is provided by them. Last commit in the office bohemia repo before migrating: 8854bfbeb077433015c93de582d0eefa2c657fa7

The SharedSignal distributed data structure is used to handle local, remote ops and offline scenarios. Transactions are set up using this DDS to generate marker op. Example [DDS1 OP -> DDS2 OP -> DDS3 OP -> Shared Signal DDS op]

### Creation

To create a `SharedSignal`, call the static create method:

```typescript

const mySignal = SharedSignal.create(this.runtime, id);

```

#### `.notify()`

Used for generating a signal

### `.processCore()`

Used for processing a shared signal operation.
