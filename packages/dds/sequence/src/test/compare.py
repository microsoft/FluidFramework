import json
from typing import List, Optional
import os
import sys

class Operation:
    type: str
    content: Optional[str]
    index: Optional[int]
    start: Optional[int]
    end: Optional[int]
    string_id: Optional[str]

    def __init__(self, op) -> None:
        self.type = op['type']
        self.content = op.get('content')
        self.index = op.get('index')
        self.start = op.get('start')
        self.end = op.get('end')
        self.end = op.get('end')
        self.string_id = op.get('stringId')


class TestCase:
    operations: List[Operation]
    id: str

    def __init__(self, contents: str, id: str) -> None:
        self.operations = [Operation(op) for op in json.loads(contents)]
        self.id = id

    def types(self) -> str:
        return ",".join(f"{op.type}" for op in self.operations)

test_cases = []

for case in os.listdir("results"):
    with open(f"results/{case}", "r") as f:
        test_cases.append(TestCase(f.read(), case.removesuffix(".json")))

for case in test_cases:
    if len(sys.argv) > 1:
        if case.types() == sys.argv[1]:
            print(case.id)
    else:
        print(case.types())
