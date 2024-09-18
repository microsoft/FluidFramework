/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */


"use client"

import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import {
  SharedTree,
  SchemaFactory, Tree, TreeViewConfiguration
} from "@fluidframework/tree/internal";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Box, Button, Card, CircularProgress, Container, Grid, IconButton, Input, List, ListItem, Stack, TextField, Typography } from "@mui/material";
// eslint-disable-next-line import/no-internal-modules
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';


// The string passed to the SchemaFactory should be unique
const sf = new SchemaFactory("fluidHelloWorldSample");

class HireableAdventurer extends sf.object("HireablePartyMember", {
  id: sf.identifier,
  name: sf.string,
  description: sf.string,
  hiringCost: sf.number,
}) { }

class HireableAdventurerList extends sf.array("HireableAdventurerList", HireableAdventurer) { }

class DungeonShopItems extends sf.object("DungeonShopItems", {
  name: sf.string,
  description: sf.string,
  cost: sf.number,
}) { }

class DungeonPlanningState extends sf.object("DungeonPlanningState", {
  description: sf.string,
  hireableAdventurers: HireableAdventurerList,
  dungeonShopItems: sf.array("dungeonShopItems", DungeonShopItems),
  selectedDungeonShopItems: sf.array("selectedDungeonShopItems",
    sf.object("selectedDungeonShopItemsList", {
      name: sf.string,
      quantity: sf.string,
      totalCost: sf.number,
      justification: sf.string
    })
  ),
  selectedPartyMembers: sf.array("selectedPartyMembersList", sf.string),
  currentFunds: sf.number,
  shouldWeEmbarkOnJourney: sf.object("shouldWeEmbarkOnJourney", {
    decision: sf.boolean,
    justification: sf.string
  }),
  dungeonStrategy: sf.string,
}) { }

class AppState extends sf.object("AppState", {
  dungeonPlanningState: DungeonPlanningState
}) { }


const client = new TinyliciousClient({});
const containerSchema = {
  initialObjects: { appState: SharedTree },
};

// Here we define the tree schema, which has a single Maze object.
const treeConfiguration = new TreeViewConfiguration({
  schema: AppState,
});


async function createNewFluidContainer() {
  console.log("Creating a new container");

  const { container } = await client.createContainer(containerSchema, "2");

  const initialAppState = {
    dungeonPlanningState: {
      description: "Default Dungeon State",
      hireableAdventurers: [
        {
          name: "Jayce",
          description: "A 6ft tall close combat warrior with a sword and shield who is extremely afraid of the dark",
          hiringCost: 350
        },
        {
          name: "Alina",
          description: "A cleric capable of healing the parties wounds, she can only heal 3 times per adventurer and needs protection because she is very fragile",
          hiringCost: 300
        },
        {
          name: "Finn",
          description: "A thief with a dagger capable of disarming traps, unlocking doors, killing small enemies and trapping large ones",
          hiringCost: 150
        },
        {
          name: "Boris",
          description: "A Vampire warrior with a sword and shield who excels in the dark, can heal themselves",
          hiringCost: 450
        }
      ],
      dungeonShopItems: [],
      currentFunds: 1000,
      selectedDungeonShopItems: [],
      selectedPartyMembers: [],
      shouldWeEmbarkOnJourney: {
        decision: false,
        justification: ""
      },
      dungeonStrategy: "We're going to get drunk and run into the dungeon without a strategy!"
    }
  }

  const sharedTree = container.initialObjects.appState.viewWith(treeConfiguration);
  sharedTree.initialize(new AppState(initialAppState));
  const id = await container.attach();
  return { id, container, sharedTree };
}


async function getExistingFluidContainer(id: string) {
  console.log("attempting to get container with id", id);
  const res = await client.getContainer(id, containerSchema, "2");

  if (!res) {
    throw new Error("Failed to load from existing container.")
  }

  const { container } = res;
  const sharedTree = container.initialObjects.appState.viewWith(treeConfiguration);
  return { container: res.container, sharedTree };
}


export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The dungeon planning app state pulled from the Fluid Framework container
  const [fluidDungeonPlanningState, setFluidDungeonPlanningState] = useState<DungeonPlanningState>();
  const [isFluidInitialized, setIsFluidInitialized] = useState(false);

  const [dungeonDescription, setDungeonDescription] = useState("");
  const [dungeonDescriptionPrev, setDungeonDescriptionPrev] = useState("");
  const [hireableAdventurers, setHireableAdventurers] = useState<{
    name: string;
    description: string;
    hiringCost: number;
  }[]>([]);
  const [selectedPartyMembers, setSelectedPartyMembers] = useState<Set<string>>(new Set())
  const [dungeonStrategy, setDungeonStrategy] = useState("");
  const [currentFunds, setCurrentFunds] = useState<number>(0)

  // See more about getting window hash with next 14: https://github.com/vercel/next.js/discussions/49465
  useEffect(() => {
    if (!isFluidInitialized) {
      const fluidContainerId = searchParams.get('fluidContainerId');
      if (fluidContainerId !== null) {
        console.log("loading existing container");
        const init = async () => {
          const data = await getExistingFluidContainer(fluidContainerId);
          if (data) {
            setFluidDungeonPlanningState(data.sharedTree.root.dungeonPlanningState);
          }
        }
        init();
      } else {
        const init = async () => {
          const data = await createNewFluidContainer();
          setFluidDungeonPlanningState(data.sharedTree.root.dungeonPlanningState);
          router.replace(`${window.location}?fluidContainerId=${data.id}`);
        }
        init();
      }

      setIsFluidInitialized(true)
    }

  }, [searchParams])

  useEffect(() => {
    const treeNodeListenerCancels: VoidFunction[] = [];

    if (fluidDungeonPlanningState !== undefined) {

      // Initialize local app state pieces from Fluid State
      // ----------------------------------------------------------------
      setDungeonDescription(fluidDungeonPlanningState.description);
      setDungeonDescriptionPrev(fluidDungeonPlanningState.description);
      setHireableAdventurers(
        fluidDungeonPlanningState.hireableAdventurers.map((obj, index) => {
          console.log(Tree.shortId(fluidDungeonPlanningState.hireableAdventurers.at(index)!));
          return {
            id: obj.id,
            name: obj.name,
            description: obj.description,
            hiringCost: obj.hiringCost
          }
        })
      );
      setDungeonStrategy(fluidDungeonPlanningState.dungeonStrategy);
      setCurrentFunds(fluidDungeonPlanningState.currentFunds);
      setSelectedPartyMembers(new Set([...fluidDungeonPlanningState.selectedPartyMembers]));

      // ----------------------------------------------------------------

      // Setup rerender loop on change to Fluid Tree state pieces
      const listener = Tree.on(fluidDungeonPlanningState, "nodeChanged", () => {
        console.log('root tree observed nodeChanged event')

        if (fluidDungeonPlanningState.description !== dungeonDescription) {
          setDungeonDescription(fluidDungeonPlanningState?.description);
        }

        if (fluidDungeonPlanningState.currentFunds !== currentFunds) {
          setCurrentFunds(fluidDungeonPlanningState.currentFunds)
        }

        const fluidSelectedMembers = new Set([...fluidDungeonPlanningState.selectedPartyMembers]);
        if (fluidSelectedMembers !== selectedPartyMembers) {
          setSelectedPartyMembers(fluidSelectedMembers)
        }

        const fluidHireablePartyMembers = fluidDungeonPlanningState.hireableAdventurers.map(obj => {
          return {
            id: obj.id,
            name: obj.name,
            description: obj.description,
            hiringCost: obj.hiringCost
          }
        });
        if (hireableAdventurers !== fluidHireablePartyMembers) {
          setHireableAdventurers(fluidHireablePartyMembers)
        }
      });


      // We need to handle nested object arrays differently.
      const listener2 = Tree.on(fluidDungeonPlanningState.hireableAdventurers, "treeChanged", () => {
        // console.log('hireableAdventurers treeChanged observed')
        setHireableAdventurers(
          fluidDungeonPlanningState.hireableAdventurers.map(obj => {
            return {
              id: obj.id,
              name: obj.name,
              description: obj.description,
              hiringCost: obj.hiringCost
            }
          })
        );
      });

      treeNodeListenerCancels.push(listener, listener2);
    }

    // Clean up tree node listeners.
    return () => {
      treeNodeListenerCancels.forEach(listenerCancel => listenerCancel())
    }
  }, [fluidDungeonPlanningState]);


  async function sendDungeonDescription(dungeonDescription: string) {
    const url = '/api/llmTest';
    const requestBody = {
      dungeonDescription: dungeonDescription
    };

    try {
      const response = await fetch(url, {
        method: 'POST', // Use 'POST' to send data
        headers: {
          'Content-Type': 'application/json', // Set the content type to JSON
        },
        body: JSON.stringify(requestBody), // Convert the JavaScript object to a JSON string
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const responseData = await response.json(); // Parse the response JSON
      console.log('Response:', responseData);
      if (fluidDungeonPlanningState) {
        setDungeonDescriptionPrev(dungeonDescription);
        fluidDungeonPlanningState.description = responseData.data.description
      }

      return responseData; // Return the parsed response data
    } catch (error) {
      console.error('Error:', error);
    }
  }

  async function generateNewHireablePartyMembers(dungeonDescription: string, totalBudget: number) {
    const url = '/api/generate-party-members';
    const requestBody = {
      dungeonDescription: dungeonDescription,
      totalBudget: totalBudget
    };

    try {
      const response = await fetch(url, {
        method: 'POST', // Use 'POST' to send data
        headers: {
          'Content-Type': 'application/json', // Set the content type to JSON
        },
        body: JSON.stringify(requestBody), // Convert the JavaScript object to a JSON string
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const responseData = await response.json(); // Parse the response JSON
      console.log('Response:', responseData);
      if (fluidDungeonPlanningState) {

        // Why doesn't this work event trigger handlers
        fluidDungeonPlanningState.hireableAdventurers = responseData.data.partyMembers;
      }

      return responseData; // Return the parsed response data
    } catch (error) {
      console.error('Error:', error);
    }
  }

  async function generateHireablePartyMemberChangesAndUpdates(dungeonDescription: string, totalBudget: number) {
    const url = '/api/generate-hireable-party-member-updates';
    const requestBody = {
      dungeonDescription: dungeonDescription,
      totalBudget: totalBudget,
      currentPartyMembers: hireableAdventurers
    };

    try {
      const response = await fetch(url, {
        method: 'POST', // Use 'POST' to send data
        headers: {
          'Content-Type': 'application/json', // Set the content type to JSON
        },
        body: JSON.stringify(requestBody), // Convert the JavaScript object to a JSON string
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const responseData = await response.json(); // Parse the response JSON
      const newAdventurers = responseData.data.partyMembers as HireableAdventurerList;
      console.log('Response:', responseData);
      console.log('current hireable Adventureres:', hireableAdventurers);
      if (fluidDungeonPlanningState) {

        const nodeIdMap: Record<string, { node: HireableAdventurer, index: number }> = {};
        fluidDungeonPlanningState.hireableAdventurers.forEach((obj, index) => {
          nodeIdMap[obj.id] = {
            node: obj,
            index
          };
        })

        // Delete existing nodes that no longer exist
        const existingNodeIds = Object.keys(nodeIdMap);
        const returnedNodeIds = new Set(newAdventurers.map(obj => obj.id));
        existingNodeIds.forEach(id => {
          if (!returnedNodeIds.has(id)) {
            console.log(`REMOVING node with id ${id} and index ${nodeIdMap[id].index}`, nodeIdMap[id].index);
            // console.log('fluid array len: ', fluidDungeonPlanningState.hireableAdventurers.length)
            // fluidDungeonPlanningState.hireableAdventurers.removeAt(nodeIdMap[id].index);
            // console.log('fluid array len AFTER remove: ', fluidDungeonPlanningState.hireableAdventurers.length)
            fluidDungeonPlanningState.hireableAdventurers.forEach((obj, index) => {
              nodeIdMap[obj.id] = {
                node: obj,
                index
              };
            })

          }
        });

        newAdventurers.forEach(member => {
          // Update existing nodes if they have changed have changed
          if (nodeIdMap[member.id] !== undefined) {
            const currNode = nodeIdMap[member.id].node;
            const currNodeIndex = nodeIdMap[member.id].index;
            if (currNode.description !== member.description || currNode.hiringCost !== member.hiringCost || currNode.name !== member.name) {
              console.log(`replacing node at index ${currNodeIndex} and id ${member.id}`)
              console.log(fluidDungeonPlanningState.hireableAdventurers.length)
              fluidDungeonPlanningState.hireableAdventurers.removeAt(currNodeIndex);
              console.log(fluidDungeonPlanningState.hireableAdventurers.length)
              fluidDungeonPlanningState.hireableAdventurers.insertAt(currNodeIndex, member);
            }
          }
          // Insert new nodes
          else {
            console.log(`adding new node to start of array`)
            fluidDungeonPlanningState.hireableAdventurers.insertAtStart(member);
          }
        });


      }

      return responseData; // Return the parsed response data
    } catch (error) {
      console.error('Error:', error);
    }
  }

  return <Container maxWidth='xl'>
    <Typography variant='h1' textAlign='center' sx={{ py: 5 }}>Dungeon Planner</Typography>
    <Stack spacing={4}>
      <Card
        sx={{
          borderRadius: '15px', p: 2, width: '100%',
          background: 'linear-gradient(145deg, #ffffff, #e1ded9)',
          boxShadow: '20px 20px 60px #8c8a87, -20px -20px 60px #ffffff'
        }}>

        <Stack spacing={2} sx={{ mb: 1 }} alignItems='center'>
          <Button variant='contained'
            onClick={() => { sendDungeonDescription(dungeonDescription) }}
          >
            <Icon icon='octicon:copilot-16' width={30} height={30} color='white' />
          </Button>
          <Button variant='contained'
            onClick={() => {
              if (fluidDungeonPlanningState) {
                console.log('resetting desk to ', dungeonDescriptionPrev)
                fluidDungeonPlanningState.description = dungeonDescriptionPrev
              }
            }}
          >
            undo
          </Button>
          <Typography variant='h4' textAlign='center'>Dungeon Description</Typography>
          <Typography variant='body1' textAlign='center'>Describe the dungeon, what monsters & traps lurk, the size, location, etc.</Typography>
          {!isFluidInitialized && <CircularProgress />}
          {isFluidInitialized &&
            <TextField
              label='Dungeon Description'
              value={dungeonDescription}
              fullWidth
              InputProps={{
                sx: {
                  backgroundColor: 'white',
                }
              }}
              minRows={1}
              maxRows={4}
              multiline
              onChange={(e) => {
                if (fluidDungeonPlanningState) {
                  fluidDungeonPlanningState.description = e.target.value
                }
              }}
            />
          }
        </Stack>
      </Card>

      <Stack alignItems='center'>
        <Button variant='contained'
          onClick={() => { generateNewHireablePartyMembers(dungeonDescription, currentFunds) }}
          startIcon={<Icon icon='octicon:copilot-16' width={30} height={30} color='white' />}
        >
          Generate New Party Members
        </Button>
        <Button variant='contained'
          onClick={() => { generateHireablePartyMemberChangesAndUpdates(dungeonDescription, currentFunds) }}
          color='secondary'
          startIcon={<Icon icon='octicon:copilot-16' width={30} height={30} color='white' />}
        >

          Revise & Add Party Members
        </Button>
        <Typography variant='h4' textAlign='center'>Hireable Adventurers</Typography>
        <Typography variant='body1' textAlign='center' sx={{ mb: 8 }}>Describe the party members available for hire.</Typography>
        {!isFluidInitialized && <CircularProgress />}

        {isFluidInitialized &&
          <Grid container spacing={10} width='100%' height={1}>
            {hireableAdventurers?.map((adventurer, index) =>
              <Grid item xs={6} key={`adventerur` + index}>
                <Card
                  sx={{
                    borderRadius: '15px', p: 3, width: '100%', position: 'relative',
                    background: 'linear-gradient(145deg, #ffffff, #e1ded9)',
                    boxShadow: '20px 20px 60px #8c8a87, -20px -20px 60px #ffffff'
                  }}>

                  <Box component='span' sx={{ position: 'absolute', top: 5, right: 5 }}>
                    <IconButton onClick={() => {
                      fluidDungeonPlanningState?.hireableAdventurers.removeAt(index);
                    }}>
                      <Icon icon='zondicons:close-solid' width={20} height={20} />
                    </IconButton>
                  </Box>

                  <Stack spacing={2}>
                    <TextField
                      label='Name'
                      value={adventurer.name}
                      InputProps={{
                        sx: {
                          backgroundColor: 'white',
                          maxWidth: '200px'
                        }
                      }}
                      onChange={(e) => {
                        if (fluidDungeonPlanningState) {
                          fluidDungeonPlanningState.hireableAdventurers[index].name = e.target.value
                        }
                      }}
                    />
                    <TextField
                      label='Description'
                      value={adventurer.description}
                      InputProps={{
                        sx: {
                          backgroundColor: 'white',
                          minWidth: '100%'
                        }
                      }}
                      minRows={1}
                      maxRows={2}
                      multiline
                      onChange={(e) => {
                        if (fluidDungeonPlanningState) {
                          fluidDungeonPlanningState.hireableAdventurers[index].description = e.target.value
                        }
                      }}
                    />

                    <Stack direction='row' alignSelf='end' alignItems='center' spacing={2} >
                      <Typography variant='body1' fontWeight='bold'>{`Hiring Cost: ${adventurer.hiringCost}`}</Typography>
                      <Button variant='contained' color='success' sx={{ textTransform: 'none', fontWeight: 550 }}
                        onClick={() => {
                          if (fluidDungeonPlanningState) {
                            fluidDungeonPlanningState.selectedPartyMembers.insertAtEnd(adventurer.name);
                            fluidDungeonPlanningState.currentFunds -= adventurer.hiringCost;
                          }
                        }}
                        disabled={selectedPartyMembers.has(adventurer.name) || currentFunds < adventurer.hiringCost}
                      >Hire Adventurer</Button>
                      <Button variant='contained' color='error' sx={{ textTransform: 'none', fontWeight: 550 }}
                        onClick={() => {
                          if (fluidDungeonPlanningState) {
                            const existingMemberIndex = fluidDungeonPlanningState.selectedPartyMembers.findIndex((name) => name === adventurer.name)
                            fluidDungeonPlanningState.selectedPartyMembers.removeAt(existingMemberIndex);
                            fluidDungeonPlanningState.currentFunds += adventurer.hiringCost;

                          }
                        }}
                        disabled={!selectedPartyMembers.has(adventurer.name)}
                      >
                        Remove Adventurer
                      </Button>
                    </Stack>
                  </Stack>
                </Card>
              </Grid>
            )}
          </Grid>
        }
      </Stack>
    </Stack>

    <Card
      sx={{
        borderRadius: '15px', p: 2, width: '100%',
        my: 5,
        background: 'linear-gradient(145deg, #ffffff, #e1ded9)',
        boxShadow: '20px 20px 60px #8c8a87, -20px -20px 60px #ffffff'
      }}>
      <Stack alignItems='center'>

        <Typography variant='h5'>
          <Box component='span' fontWeight='bold'>
            {`Selected Party Members: `}
          </Box>
          {`${Array.from(selectedPartyMembers).join(", ")}`}
        </Typography>
        <Typography variant='h5'>
          <Box component='span' fontWeight='bold'>
            {`Remaining Funds: `}
          </Box>
          {`${currentFunds}`}
        </Typography>
      </Stack>
    </Card>

    <Stack sx={{ my: 5 }}>
      <Typography variant='h4' textAlign='center'>Dungeon Strategy</Typography>
      <Typography variant='body1' textAlign='center'>Describe the strategy you will use to conquer the dungeon</Typography>
      <Card
        sx={{
          my: 5,
          borderRadius: '15px', p: 2, width: '100%',
          background: 'linear-gradient(145deg, #ffffff, #e1ded9)',
          boxShadow: '20px 20px 60px #8c8a87, -20px -20px 60px #ffffff'
        }}>

        <Stack spacing={2} sx={{ mb: 1 }}>
          <TextField
            label='Dungeon Strategy'
            value={dungeonStrategy}
            InputProps={{
              sx: {
                backgroundColor: 'white',
              }
            }}
            minRows={1}
            maxRows={4}
            multiline
            onChange={(e) => {
              if (fluidDungeonPlanningState) {
                fluidDungeonPlanningState.dungeonStrategy = e.target.value
              }
            }}
          />
        </Stack>
      </Card>
    </Stack>

  </Container >
  //   <main className={styles.main}>
  //     <div className={styles.description}>
  //       <p>
  //         Get started by editing&nbsp;
  //         <code className={styles.code}>src/app/page.tsx</code>
  //       </p>
  //       <div>
  //         <a
  //           href="https://vercel.com?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
  //           target="_blank"
  //           rel="noopener noreferrer"
  //         >
  //           By{" "}
  //           <Image
  //             src="/vercel.svg"
  //             alt="Vercel Logo"
  //             className={styles.vercelLogo}
  //             width={100}
  //             height={24}
  //             priority
  //           />
  //         </a>
  //       </div>
  //     </div>

  //     {/* <div className={styles.center}>


  //       <TextField
  //         value={dungeonPlanningState?.description}
  //       />

  //     </div> */}

  //     <div className={styles.grid}>
  //       <a
  //         href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
  //         className={styles.card}
  //         target="_blank"
  //         rel="noopener noreferrer"
  //       >
  //         <h2>
  //           Docs <span>-&gt;</span>
  //         </h2>
  //         <p>Find in-depth information about Next.js features and API.</p>
  //       </a>

  //       <a
  //         href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
  //         className={styles.card}
  //         target="_blank"
  //         rel="noopener noreferrer"
  //       >
  //         <h2>
  //           Learn <span>-&gt;</span>
  //         </h2>
  //         <p>Learn about Next.js in an interactive course with&nbsp;quizzes!</p>
  //       </a>

  //       <a
  //         href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
  //         className={styles.card}
  //         target="_blank"
  //         rel="noopener noreferrer"
  //       >
  //         <h2>
  //           Templates <span>-&gt;</span>
  //         </h2>
  //         <p>Explore starter templates for Next.js.</p>
  //       </a>

  //       <a
  //         href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
  //         className={styles.card}
  //         target="_blank"
  //         rel="noopener noreferrer"
  //       >
  //         <h2>
  //           Deploy <span>-&gt;</span>
  //         </h2>
  //         <p>
  //           Instantly deploy your Next.js site to a shareable URL with Vercel.
  //         </p>
  //       </a>
  //     </div>
  //   </main>
  // );
}
