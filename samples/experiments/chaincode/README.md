# Hyperledger fabric sample contract

Reminders
* In dev mode need to make sure to rebuild the module in the target container

## Running

### Production

Starting with the HyperLedger examples

In the fabcar directory update `CC_SRC_PATH` to be `/opt/gopath/src/github.com/ts`

In the basic-network directory update the cli entry of the docker-compose file to add a new volume entry `./../../../Prague/experiments/chaincode:/opt/gopath/src/github.com/ts`

... start up the Hyperledger
```
cd fabcar
./startFabric node
```

### Development mode

... in chaincode container
```
docker exec -it chaincode bash
cd ts
CORE_CHAINCODE_ID_NAME="mycc:0" node dist/index.js --peer.address peer:7052
```

... and then in the CLI container
```
peer chaincode install -p chaincode/ts -n mycc -v 0 -l NODE
peer chaincode instantiate -n mycc -v 0 -c '{"Args":["a","10"]}' -C myc -l NODE
```
