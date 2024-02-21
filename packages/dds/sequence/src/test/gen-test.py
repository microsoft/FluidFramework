import json
import sys

def construct_test(seed):
    with open(rf"results/sharedstring-with-reconnects/{seed}.json") as f:
        ops = json.loads(f.read())

    buf = ""

    buf += "const helper = new ReconnectTestHelper();\n\n"

    for op in ops:
        if op['type'] == "addText":
            if op['content']:
                buf += f"helper.insertText(\"{op['clientId']}\", {op['index']}, \"{op['content']}\");\n"
        elif op['type'] == "removeRange":
            buf += f"helper.removeRange(\"{op['clientId']}\", {op['start']}, {op['end']});\n"
        elif op['type'] == "obliterateRange":
            buf += f"helper.obliterateRange(\"{op['clientId']}\", {op['start']}, {op['end']});\n"
        elif op['type'] == "synchronize":
            buf += "helper.processAllOps();\n"
            buf += "helper.logger.validate();\n"
        elif op['type'] == "changeConnectionState":
            buf += f"// changeConnectionState for {op['clientId']} to {op['connected']};\n"
        elif op['type'] == "attach":
            buf += f"// attach\n"
        else:
            raise Exception(f"unknown op type: {op['type']}")
    return buf

print(construct_test(sys.argv[1]))
