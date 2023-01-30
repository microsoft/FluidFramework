import os

for test in os.listdir("results"):
    test_num = test.removesuffix(".json")
    os.environ["TEST"] = test_num
    print(f"Minimizing {test_num}")
    os.system("ts-mocha intervalCollection.fuzz.spec.ts")
