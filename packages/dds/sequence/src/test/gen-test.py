import json
import sys

def construct_test(seed):
    with open(rf"results\{seed}.json") as f:
        ops = json.loads(f.read())

    buf = ""

    buf += "const helper = new ReconnectTestHelper();\n\n"

    for op in ops:
        if op['type'] == "addText" and op['content']:
            buf += f"helper.insertText(\"{op['stringId']}\", {op['index']}, \"{op['content']}\");\n"
        elif op['type'] == "removeRange":
            buf += f"helper.removeRange(\"{op['stringId']}\", {op['start']}, {op['end']});\n"
        elif op['type'] == "obliterateRange":
            buf += f"helper.obliterateRange(\"{op['stringId']}\", {op['start']}, {op['end']});\n"
        elif op['type'] == "synchronize":
            buf += "helper.processAllOps();\n"
            buf += "helper.logger.validate();\n"
        else:
            raise "unknown op type"
    return buf

print(construct_test(sys.argv[1]))
