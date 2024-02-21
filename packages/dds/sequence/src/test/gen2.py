import json
import sys

def client_id(clientId: str) -> int:
    if len(clientId) == 1:
        return ord(clientId) - ord('A')
    return clientId


def construct_test(dir: str, seed: int) -> str:
    with open(f"fuzz/results/{dir}/{seed}.json") as f:
        ops = json.loads(f.read())

    buf = ""
    num_intervals = 0

    for op in ops:
        if op['type'] == "addText":
            if not op['content']:
                continue
            buf += f"clients[{client_id(op['clientId'])}].sharedString.insertText({op['index']}, \"{op['content']}\");\n"
        elif op['type'] == "removeRange":
            buf += f"clients[{client_id(op['clientId'])}].sharedString.removeRange({op['start']}, {op['end']});\n"
        elif op['type'] == "obliterateRange":
            buf += f"clients[{client_id(op['clientId'])}].sharedString.obliterateRange({op['start']}, {op['end']});\n"
        elif op['type'] == "synchronize":
            buf += "containerRuntimeFactory.processAllMessages();\n"
            buf += "assertConsistent(clients);\n"
        elif op['type'] == "changeConnectionState":
            buf += f"clients[{client_id(op['clientId'])}].containerRuntime.connected = {str(op['connected']).lower()};\n"
        elif op['type'] == "addInterval":
            buf += f"const collection_{num_intervals} = clients[{client_id(op['clientId'])}].sharedString.getIntervalCollection(\"{op['collectionName']}\");\n"
            buf += f"collection_{num_intervals}.add({op['start']}, {op['end']}, IntervalType.SlideOnRemove, {{ intervalId: \"{op['id']}\" }});\n"
            num_intervals += 1
        elif op['type'] == "rebase":
            buf += f"// rebase for client {client_id(op['clientId'])}\n" # change to whatever you want
        elif op['type'] == "addClient":
            buf += f"// add client {client_id(op['addedClientId'])}\n"
        elif op['type'] == "changeInterval":
            buf += f"const collection_{num_intervals} = clients[{client_id(op['clientId'])}].sharedString.getIntervalCollection(\"{op['collectionName']}\");\n"
            buf += f"collection_{num_intervals}.change(\"{op['id']}\", {op['start']}, {op['end']});\n"
            num_intervals += 1
        elif op['type'] == "changeProperties":
            buf += f"const collection_{num_intervals} = clients[{client_id(op['clientId'])}].sharedString.getIntervalCollection(\"{op['collectionName']}\");\n"
            buf += f"collection_{num_intervals}.changeProperties(\"{op['id']}\", {json.dumps(op['properties'])});\n"
            num_intervals += 1
        elif op['type'] == "deleteInterval":
            buf += f"const collection_{num_intervals} = clients[{client_id(op['clientId'])}].sharedString.getIntervalCollection(\"{op['collectionName']}\");\n"
            buf += f"collection_{num_intervals}.removeIntervalById(\"{op['id']}\");\n"
            num_intervals += 1
        elif op['type'] == "attach":
            buf += "// attach\n"
        else:
            raise Exception(f"unknown op type: {op['type']}")
    return buf

dir = sys.argv[1]
seed = int(sys.argv[2])

print(construct_test(dir, seed))
