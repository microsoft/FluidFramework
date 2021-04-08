#!/usr/bin/env python
import os
import sys
import fnmatch
import json
import platform


import sys

requiredfluidBranch="partial_changesets"
fluidPath=""

if len(sys.argv) != 2:
    print("Error provide path to FluidFramework repo")
    exit()
else:
    repo_path = sys.argv[1]
    ok=False
    try:
        with open(repo_path+"/package.json") as json_file:
            package_json =  json.load(json_file)
            name = package_json.get("name","invalid")
            if name=="root":
                print("FluidFramework respository found")
                base_dir = os.getcwd()
                os.chdir(repo_path)
                branch_name = os.popen("git branch --show-current").read().rstrip("\n")
                os.chdir(base_dir)
                if requiredfluidBranch != branch_name:                    
                    print("FluidFramework repository needs to checked out on branch \"%s\"" % (requiredfluidBranch))
                else:
                    fluidPath= repo_path
                    ok=True
    except Exception as e: 
        print(e)
        ok=False
        print("invalid path")
    finally:
        if(ok == False):
            exit()

link_command= "ln -s"
move_command= "mv"
if platform.system() == "Windows":
    link_command= "mklink /D"
    move_command="move"


linkable_packages= []
matches = []

# find all fluid packages in the framework repo
for root, dirnames, filenames in os.walk(fluidPath,topdown=True):
    if "node_modules" in dirnames:
        dirnames.remove("node_modules")
    for filename in fnmatch.filter(filenames, 'package.json'):
        matches.append(os.path.join(root, filename))




for package in matches:
    with open(package) as json_file:
        try:
            package_json =  json.load(json_file)
            name= package_json.get("name")
            if name and "/" in name:
                backup=name
                short_name = name.split("/")[1]
                folder = package[:-len("package.json")]
                linkable_packages.append((short_name, folder))
        except:            
            print("skipping due to error")

counter =0
for root, dirnames, filenames in os.walk("./node_modules/@fluidframework",topdown=True):
    for dir in dirnames:
        for (name, path) in linkable_packages:          
            if dir == name:
                old = os.path.join(root, dir)
                new = os.path.join(root, "_%s" %(dir))
                os.system("%s %s %s"%(move_command, old,new))
                os.system("%s %s %s"%(link_command, path,old))
                counter=counter+1

print("linked a total of %i packages"%(counter))



