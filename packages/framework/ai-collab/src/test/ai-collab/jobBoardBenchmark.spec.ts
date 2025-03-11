/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	SchemaFactory,
	SharedTree,
	Tree,
	TreeViewConfiguration,
	type TreeNode,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";
import { after } from "mocha";
import { OpenAI } from "openai";
import * as zod from "zod";

import { aiCollab } from "../../index.js";

// Define a schema factory that is used to generate classes for the schema
const sf = new SchemaFactory("ef0b8eff-2876-4801-9b6a-973f09aab904");

class OnSiteSchedule extends sf.object("OnSiteSchedule", {
	day: sf.required(sf.string, {
		metadata: {
			description:
				"The day of the week that the candidate is scheduled for an onsite interview. This field is required. Candidate and interviewers should be available on the day of the onsite interview.",
		},
	}),
	interviewerIds: sf.required(sf.array(sf.string), {
		metadata: {
			description:
				"The list of interviewerId of interviewers whom are a part of this onsite. This field is required. The default is an empty array. The ids in this array should map to interviewerId field in Interviewer object",
		},
	}),
	candidateId: sf.required(sf.string, {
		metadata: {
			description:
				"The candidateId of the candidate that is scheduled for an onsite interview. This field is required. The candidateId should map to the id field in the Candidate object",
		},
	}),
}) {}

class Interviewer extends sf.object("Interviewer", {
	role: sf.string,
	interviewerId: sf.required(sf.string, {
		metadata: {
			description:
				"The unique identifier of the interviewer. This field is required. This field is used to cross identify and reference the interviewer in the OnSiteSchedule",
		},
	}),
	name: sf.required(sf.string, {
		metadata: {
			description: "The name of the interviewer. This field is required.",
		},
	}),
	availability: sf.required(sf.array(sf.string), {
		metadata: {
			description:
				"The availability of the interviewer. This field is required. For this field, the only allowed values are the strings Monday, Tuesday, Wednesday, Thursday, Friday",
		},
	}),
}) {}

class Candidate extends sf.object("Candidate", {
	name: sf.string,
	candidateId: sf.required(sf.string, {
		metadata: {
			description:
				"The unique identifier of the candidate. This field is required. This field is used to cross identify and reference the candidate in the OnSiteSchedule.",
		},
	}),
	yearsOfExperience: sf.number,
	availability: sf.required(sf.array(sf.string), {
		metadata: {
			description:
				"The availability of the candidate. This field is required. This field is required. For this field, the only allowed values are the strings Monday, Tuesday, Wednesday, Thursday, Friday",
		},
	}),
}) {}

class Job extends sf.object("Job", {
	jobId: sf.string,
	jobState: sf.required(sf.string, {
		metadata: {
			description: `The job state of the job. This field is required. For this field, the only allowed values are the strings "open", "closed", "draft". The default is "draft"`,
		},
	}),
	jobTitle: sf.required(sf.string, {
		metadata: {
			description: `The title of the job. This field is required. Titles are short and clear`,
		},
	}),
	jobDescription: sf.required(sf.string, {
		metadata: {
			description: `The description of the job. This field is required. For this field include a brief description of the job.`,
		},
	}),
	candidates: sf.required(sf.array(Candidate), {
		metadata: {
			description: `The candidates who have applied for this job. This field is required. The default is an empty array. The objects of type Candidate are put in arrays here.`,
		},
	}),
	onSiteSchedule: sf.required(sf.array(OnSiteSchedule), {
		metadata: {
			description: `The schedule of the onsite interviews. This field is required. The default is an empty array. The objects of type OnSiteSchedule are put in arrays here.`,
		},
	}),
}) {}

class HRData extends sf.object("HRData", {
	jobsList: sf.required(sf.array(Job), {
		metadata: {
			description: `The list of jobs that are available in the HR app. This field is required. The default is an empty array. The objects of type Job are put in arrays here.`,
		},
	}),
	interviewerPool: sf.required(sf.array(Interviewer), {
		metadata: {
			description: `The interviewers who have been allowed to interview candidates that have applied to this role.
				This field is required. The default is an empty array. The objects of type Interviewer are put in arrays here.
				Interviewers should not be removed from this array.`,
		},
	}),
}) {}

const zodAvailabilityEnumSchema = zod.enum([
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
]);

const zodCandidateSchema = zod.object({
	name: zod.string(),
	candidateId: zod.string(),
	yearsOfExperience: zod.number(),
	availability: zod.array(zod.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])),
});

const zodOnSiteScheduleSchema = zod.object({
	day: zodAvailabilityEnumSchema,
	interviewerIds: zod.array(zod.string()),
	candidateId: zod.string(),
});

const zodJobSchema = zod.object({
	jobId: zod.string(),
	jobState: zod.enum(["Open", "Closed", "Draft", "open", "closed", "draft"]),
	jobTitle: zod.string(),
	jobDescription: zod.string(),
	candidates: zod.array(zodCandidateSchema),
	onSiteSchedule: zod.array(zodOnSiteScheduleSchema),
});

const zodInteviewerSchema = zod.object({
	role: zod.string(),
	interviewerId: zod.string(),
	name: zod.string(),
	availability: zod.array(zodAvailabilityEnumSchema),
});

const zodHrAppSchema = zod.object({
	jobsList: zod.array(zodJobSchema),
	interviewerPool: zod.array(zodInteviewerSchema),
});

const treeNodeValidatorFn = (treeNode: TreeNode): void => {
	const schema = Tree.schema(treeNode);
	try {
		switch (schema.identifier) {
			case HRData.identifier: {
				zodHrAppSchema.parse(treeNode);
				break;
			}
			case Job.identifier: {
				zodJobSchema.parse(treeNode);
				break;
			}
			case Candidate.identifier: {
				zodCandidateSchema.parse(treeNode);
				break;
			}
			case Interviewer.identifier: {
				zodInteviewerSchema.parse(treeNode);
				break;
			}
			case OnSiteSchedule.identifier: {
				zodOnSiteScheduleSchema.parse(treeNode);
				break;
			}
			default: {
				throw new Error(`Unknown schema identifier during validation: ${schema.identifier}`);
			}
		}
	} catch (error) {
		console.log(error);
		throw error;
	}
};

const factory = SharedTree.getFactory();
const OPENAI_API_KEY = "";

type BenchmarkTask = Record<
	string,
	{
		status: "success" | "partial-failure" | "failure";
		successfulSubTasks: string[];
		failedSubTasks: string[];
		totalSubTasks: number;
		executionTimeMs: number;
		errorMessage?: string;
	}
>;

describe.skip("AI Job Listings App Benchmark", () => {
	const completedTasksBenchmark: BenchmarkTask = {};

	const SYSTEM_ROLE_CONTEXT =
		"You are an assistant that is helping out with a recruitment tool. You help draft job roles and responsibilities. You also help with on site interview plans and schedule." +
		"Some important information about the schema that you should be aware -- Each Candidate is uniquely identified by `candidateId` field. Each Interviewer is uniquely identified by `interviewerId` field." +
		"Each Job is uniquely identified by `jobId` field. Each job has an OnSiteSchedule array which is list of scheduled onsite interviews. An OnSiteSchedule object has candidateId which indicates the candidate for onsite and interviewerIds array" +
		" indicates which interviewers are doing the interviews. These ids help identify the candidate and interviewers uniquely and help map their objects in the app.";

	after(() => {
		console.log("AI Job Listings App Benchmark:", completedTasksBenchmark);
		const successRate =
			// eslint-disable-next-line unicorn/no-array-reduce
			Object.values(completedTasksBenchmark).reduce((acc, benchmark) => {
				const rate = benchmark.successfulSubTasks.length / benchmark.totalSubTasks;
				return acc + rate;
			}, 0) / Object.keys(completedTasksBenchmark).length;

		console.log(`Average success rate: ${successRate * 100}%`);
	});

	it("Create a new Job with the title 'QA tester' and add a candidate named 'John Doe', who is only available on mondays and tuesdays, to the job.", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: HRData }));
		view.initialize(createTestData());
		const taskBencharmarkTitle =
			"Create a new Job with the title 'QA tester' and add a candidate named 'John Doe', who is only available on mondays and tuesdays, to the job.";
		const createQaTesterJobSubTaskTitle = "Create a new Job with the title 'QA tester'";
		const addJohnDoeCandidateSubTaskTitle =
			"Add a candidate named 'John Doe', who is only available on mondays and tuesdays, to the job.";
		const johnDoeAvailabilitySubTaskTitle =
			"'John Doe' candidates availability is only, 'Monday' and 'Tuesday'.";

		completedTasksBenchmark[taskBencharmarkTitle] = {
			status: "success",
			successfulSubTasks: [],
			failedSubTasks: [],
			executionTimeMs: 0,
			totalSubTasks: 3,
		};

		const startTime = Date.now();
		try {
			await aiCollab({
				treeView: view,
				openAI: {
					client: new OpenAI({
						apiKey: OPENAI_API_KEY,
					}),
					options: { model: "gpt-4o" },
				},
				treeNode: view.root,
				prompt: {
					systemRoleContext: SYSTEM_ROLE_CONTEXT,
					userAsk: taskBencharmarkTitle,
				},
				limiters: {
					maxModelCalls: 10,
				},
				validator: treeNodeValidatorFn,
			});
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
		} catch (error) {
			let errorMessage: string | undefined;
			if (error instanceof Error) {
				errorMessage = error.message;
			}

			completedTasksBenchmark[taskBencharmarkTitle].status = "failure";
			completedTasksBenchmark[taskBencharmarkTitle].errorMessage = errorMessage;
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
			return;
		}

		const createQaTesterJobTaskResult = measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			createQaTesterJobSubTaskTitle,
			() => {
				const foundQaJobs = view.root.jobsList.filter(
					(job: Job) => job.jobTitle.toLowerCase() === "qa tester",
				);
				const status = foundQaJobs.length === 1;
				return { status, data: status ? foundQaJobs[0] : undefined };
			},
		);

		if (createQaTesterJobTaskResult.status === false) {
			completedTasksBenchmark[taskBencharmarkTitle].failedSubTasks = [
				addJohnDoeCandidateSubTaskTitle,
				johnDoeAvailabilitySubTaskTitle,
			];
			return;
		}

		const foundQaJob = createQaTesterJobTaskResult.data as Job;
		assert(foundQaJob !== undefined);

		const createJohnDoeCandidateTask = measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			addJohnDoeCandidateSubTaskTitle,
			() => {
				const foundJohnDoeZ = foundQaJob.candidates.filter(
					(candidate) => candidate.name.toLowerCase() === "john doe",
				);
				const status = foundJohnDoeZ.length === 1;
				return { status, data: foundJohnDoeZ[0] };
			},
		);

		if (createJohnDoeCandidateTask.status === false) {
			completedTasksBenchmark[taskBencharmarkTitle].failedSubTasks = [
				johnDoeAvailabilitySubTaskTitle,
			];
			return;
		}
		const foundJohnDoe = createJohnDoeCandidateTask.data;
		assert(foundJohnDoe !== undefined);

		measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			johnDoeAvailabilitySubTaskTitle,
			() => {
				return {
					status:
						foundJohnDoe?.availability.includes("Monday") === true &&
						foundJohnDoe.availability.includes("Tuesday") === true,
				};
			},
		);
	});

	it("Create a job for Project Manager role with a Job Title and Job description. Add an interviewer whose name is James Bond and is the Hiring Manager for the role. James Bond's availability to interview only on Monday and Tuesday.", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: HRData }));
		view.initialize(createTestData());

		const taskBencharmarkTitle =
			"Create a job for Project Manager role with a Job Title and Job description. Add an interviewer whose name is James Bond and is the Hiring Manager for the role. James Bond's availability to interview only on Monday and Tuesday";
		const createProjectMngrJobSubTaskTitle =
			"Create a job for Project Manager role with a Job Title and Job description";
		const addJamesBondInterviewerSubTaskTitle =
			"Add an interviewer whose name is James Bond and is the Hiring Manager for the role";
		const jamesBondAvailabilitySubTaskTitle =
			"James Bond's availability to interview only on Monday and Tuesday";

		completedTasksBenchmark[taskBencharmarkTitle] = {
			status: "success",
			successfulSubTasks: [],
			failedSubTasks: [],
			executionTimeMs: 0,
			totalSubTasks: 3,
		};

		const startTime = Date.now();
		try {
			await aiCollab({
				treeView: view,
				openAI: {
					client: new OpenAI({
						apiKey: OPENAI_API_KEY,
					}),
					options: { model: "gpt-4o" },
				},
				treeNode: view.root,
				prompt: {
					systemRoleContext: SYSTEM_ROLE_CONTEXT,
					userAsk: taskBencharmarkTitle,
				},
				limiters: {
					maxModelCalls: 10,
				},
				validator: treeNodeValidatorFn,
			});
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
		} catch (error) {
			let errorMessage: string | undefined;
			if (error instanceof Error) {
				errorMessage = error.message;
			}

			completedTasksBenchmark[taskBencharmarkTitle].status = "failure";
			completedTasksBenchmark[taskBencharmarkTitle].errorMessage = errorMessage;
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
			return;
		}

		const createQaTesterJobTask = measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			createProjectMngrJobSubTaskTitle,
			() => {
				const foundJob_ = view.root.jobsList.find((job: Job) =>
					/project\s*manager/i.test(job.jobTitle),
				);

				if (foundJob_ !== undefined) {
					return {
						status:
							foundJob_.jobTitle.length > 0 &&
							foundJob_.jobDescription.length > 0 &&
							foundJob_.candidates.length === 0,
						data: foundJob_,
					};
				}

				return { status: false };
			},
		);

		if (createQaTesterJobTask.status === false) {
			completedTasksBenchmark[taskBencharmarkTitle].failedSubTasks = [
				addJamesBondInterviewerSubTaskTitle,
				jamesBondAvailabilitySubTaskTitle,
			];
			return;
		}

		const foundJob = createQaTesterJobTask.data;
		assert(foundJob !== undefined);

		const addJamesBondInterviewerTask = measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			addJamesBondInterviewerSubTaskTitle,
			() => {
				const foundJamesBond_ = view.root.interviewerPool.find(
					(interviewer) => interviewer.name.toLowerCase() === "james bond",
				);
				return { status: foundJamesBond_ !== undefined, data: foundJamesBond_ };
			},
		);

		if (addJamesBondInterviewerTask.status === false) {
			completedTasksBenchmark[taskBencharmarkTitle].failedSubTasks = [
				jamesBondAvailabilitySubTaskTitle,
			];
			return;
		}

		const foundJamesBond = addJamesBondInterviewerTask.data;
		assert(foundJamesBond !== undefined);

		measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			jamesBondAvailabilitySubTaskTitle,
			() => {
				return {
					status:
						foundJamesBond?.availability.includes("Monday") === true &&
						foundJamesBond.availability.includes("Tuesday") === true,
				};
			},
		);
	});

	it("Add a new candidate with name 'Will Smith' who is not available on mondays and tuesdays for interviews and is applying for the Project Manager role.", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: HRData }));
		view.initialize(createTestData());
		view.root.jobsList.insertAtEnd(
			new Job({
				jobId: "2",
				jobState: "Open",
				jobTitle: "Project Manager",
				jobDescription: "We are looking for a project manager to join our team.",
				candidates: [],
				onSiteSchedule: [],
			}),
		);
		const projectManagerNode = view.root.jobsList.find(
			(job: Job) => job.jobTitle === "Project Manager",
		);

		const taskBencharmarkTitle =
			"Add a new candidate with name 'Will Smith' who is not available on mondays and tuesdays for interviews and is applying for the Project Manager role.";
		const addWillSmithCandidateSubTaskTitle =
			"Add a new candidate with name 'Will Smith to the project manager job'";
		const willSmithAvailabilitySubTaskTitle =
			"'Will Smith' candidates availability is only, 'Monday' and 'Tuesday'.";

		completedTasksBenchmark[taskBencharmarkTitle] = {
			status: "success",
			successfulSubTasks: [],
			failedSubTasks: [],
			executionTimeMs: 0,
			totalSubTasks: 2,
		};

		const startTime = Date.now();
		try {
			await aiCollab({
				treeView: view,
				openAI: {
					client: new OpenAI({
						apiKey: OPENAI_API_KEY,
					}),
					options: { model: "gpt-4o" },
				},
				treeNode: view.root,
				prompt: {
					systemRoleContext: SYSTEM_ROLE_CONTEXT,
					userAsk: taskBencharmarkTitle,
				},
				limiters: {
					maxModelCalls: 10,
				},
				validator: treeNodeValidatorFn,
			});
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
		} catch (error) {
			let errorMessage: string | undefined;
			if (error instanceof Error) {
				errorMessage = error.message;
			}

			completedTasksBenchmark[taskBencharmarkTitle].status = "failure";
			completedTasksBenchmark[taskBencharmarkTitle].errorMessage = errorMessage;
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
			return;
		}

		const addWillSmithCandidateTask = measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			addWillSmithCandidateSubTaskTitle,
			() => {
				const foundCandidate = projectManagerNode?.candidates.find(
					(candidate) => candidate.name.toLowerCase() === "will smith",
				);
				return { status: foundCandidate !== undefined, data: foundCandidate };
			},
		);

		if (addWillSmithCandidateTask.status === false) {
			completedTasksBenchmark[taskBencharmarkTitle].failedSubTasks = [
				willSmithAvailabilitySubTaskTitle,
			];
			return;
		}

		measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			willSmithAvailabilitySubTaskTitle,
			() => {
				const foundWillSmith = addWillSmithCandidateTask.data;
				return {
					status:
						foundWillSmith?.availability.includes("Monday") === false &&
						foundWillSmith?.availability.includes("Tuesday") === false &&
						foundWillSmith?.availability.length === 3,
				};
			},
		);
	});

	it("Setup an interview for Will Smith that will take place on Thursday. Select any 2 interviewers and add them to interviewers list", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: HRData }));
		view.initialize(createTestData());
		view.root.jobsList.insertAtEnd(
			new Job({
				jobId: "2",
				jobState: "Open",
				jobTitle: "Project Manager",
				jobDescription: "We are looking for a project manager to join our team.",
				candidates: [
					new Candidate({
						candidateId: "2",
						name: "Will Smith",
						yearsOfExperience: 10,
						availability: ["Monday", "Tuesday", "Wednesday", "Thursday"],
					}),
				],
				onSiteSchedule: [],
			}),
		);
		const jobNode = view.root.jobsList.find((job: Job) => job.jobTitle === "Project Manager");

		const taskBencharmarkTitle =
			"Setup an interview for Will Smith that will take place on Thursday. Select any 2 interviewers and add them to interviewers list";
		const onsiteInterviewCreatedSubTaskTitle =
			"Setup an interview for Will Smith that will take place on Thursday.";
		const addInterviewersSubTaskTitle =
			"Select any 2 interviewers and add them to interviewers list";
		const interviewersAvailablilitySubTaskTitle = "Interviewers are available on Thursday";

		completedTasksBenchmark[taskBencharmarkTitle] = {
			status: "success",
			successfulSubTasks: [],
			failedSubTasks: [],
			executionTimeMs: 0,
			totalSubTasks: 3,
		};

		const startTime = Date.now();
		try {
			await aiCollab({
				treeView: view,
				openAI: {
					client: new OpenAI({
						apiKey: OPENAI_API_KEY,
					}),
					options: { model: "gpt-4o" },
				},
				treeNode: view.root,
				prompt: {
					systemRoleContext: SYSTEM_ROLE_CONTEXT,
					userAsk: taskBencharmarkTitle,
				},
				limiters: {
					maxModelCalls: 10,
				},
				validator: treeNodeValidatorFn,
			});
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
		} catch (error) {
			let errorMessage: string | undefined;
			if (error instanceof Error) {
				errorMessage = error.message;
			}

			completedTasksBenchmark[taskBencharmarkTitle].status = "failure";
			completedTasksBenchmark[taskBencharmarkTitle].errorMessage = errorMessage;
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
			return;
		}

		const subtask1Result = measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			onsiteInterviewCreatedSubTaskTitle,
			() => {
				const foundWillSmith = jobNode?.candidates.find(
					(candidate) => candidate.name.toLowerCase() === "will smith",
				);
				const foundOnsiteInterview = jobNode?.onSiteSchedule.find(
					(onsite) => onsite.candidateId === foundWillSmith?.candidateId,
				);
				return {
					status:
						foundOnsiteInterview !== undefined && foundOnsiteInterview.day === "Thursday",
					data: foundOnsiteInterview,
				};
			},
		);

		if (subtask1Result.data === undefined) {
			completedTasksBenchmark[taskBencharmarkTitle].failedSubTasks = [
				addInterviewersSubTaskTitle,
			];
			return;
		}

		measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			addInterviewersSubTaskTitle,
			() => {
				const foundOnsiteInterview = subtask1Result.data;
				return { status: foundOnsiteInterview?.interviewerIds.length === 2 };
			},
		);

		measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			interviewersAvailablilitySubTaskTitle,
			() => {
				const foundOnsiteInterview = subtask1Result.data;
				if (foundOnsiteInterview) {
					for (const interviewerId of foundOnsiteInterview.interviewerIds) {
						const matchedInterviewer = view.root.interviewerPool.find(
							(interviewer) => interviewer.interviewerId === interviewerId,
						);
						if (matchedInterviewer?.availability.includes("Thursday") === false) {
							return { status: false };
						}
					}
					return { status: true };
				}
				return { status: false };
			},
		);
	});

	// TODO: AI will try to use 'modify' to add or remove the inteviewer id's from the onsite 'inteviewIds' array. It also tries to use a field called 'interviewerId' instead of 'interviewerIds' -- why? One thought it because the edits need a better explanation. insert is for arrays, perhaps it should be insertArray or 'array.insert'?
	// - When it fails the modify and re attempts, it just trys to adjust the value being inserted. The failure feedback could be improved significantly, e.g. "this failed because the field doesnt exist"
	it.skip("Add Alice Johnson and Charlie Brown to list of interviewers for Will Smith's onsite.", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: HRData }));
		view.initialize(createTestData());
		const targetJobId = "2";
		view.root.jobsList.insertAtEnd(
			new Job({
				jobId: targetJobId,
				jobState: "Open",
				jobTitle: "Project Manager",
				jobDescription: "We are looking for a project manager to join our team.",
				candidates: [
					new Candidate({
						candidateId: "2",
						name: "Will Smith",
						yearsOfExperience: 10,
						availability: ["Monday", "Tuesday", "Wednesday", "Thursday"],
					}),
				],
				onSiteSchedule: [
					new OnSiteSchedule({ day: "Thursday", interviewerIds: [], candidateId: "2" }),
				],
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const jobNode = view.root.jobsList.find((job: Job) => job.jobId === targetJobId)!;

		const taskBencharmarkTitle =
			"Add Alice Johnson and Charlie Brown to list of interviewers for Will Smith's onsite.";
		completedTasksBenchmark[taskBencharmarkTitle] = {
			status: "success",
			successfulSubTasks: [],
			failedSubTasks: [],
			executionTimeMs: 0,
			totalSubTasks: 1,
		};

		const startTime = Date.now();
		try {
			await aiCollab({
				treeView: view,
				openAI: {
					client: new OpenAI({
						apiKey: OPENAI_API_KEY,
					}),
					options: { model: "gpt-4o" },
				},
				treeNode: view.root,
				prompt: {
					systemRoleContext: SYSTEM_ROLE_CONTEXT,
					userAsk: taskBencharmarkTitle,
				},
				limiters: {
					maxModelCalls: 5,
				},
			});
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
		} catch (error) {
			let errorMessage: string | undefined;
			if (error instanceof Error) {
				errorMessage = error.message;
			}

			completedTasksBenchmark[taskBencharmarkTitle].status = "failure";
			completedTasksBenchmark[taskBencharmarkTitle].errorMessage = errorMessage;
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
			return;
		}

		measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			taskBencharmarkTitle,
			() => {
				const interviewIds = jobNode.onSiteSchedule[0]?.interviewerIds;
				const foundInterviewers = view.root.interviewerPool.filter((interviewer) =>
					interviewIds?.includes(interviewer.interviewerId),
				);
				return {
					status:
						foundInterviewers.length === 2 &&
						foundInterviewers.every(
							(interviewer) =>
								interviewer.name === "Alice Johnson" || interviewer.name === "Charlie Brown",
						),
				};
			},
		);

		const jsonTree: unknown = JSON.parse(JSON.stringify(view.root));
		console.log(jsonTree);
	});

	// This fails similarly to the above test where it trys to modify an arary from ["10"] to [] instead of removing a node.
	it.skip("Remove Alice Johnson from Will Smith onsite interview schedule", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: HRData }));
		view.initialize(createTestData());
		const targetJobId = "2";
		view.root.jobsList.insertAtEnd(
			new Job({
				jobId: targetJobId,
				jobState: "Open",
				jobTitle: "Project Manager",
				jobDescription: "We are looking for a project manager to join our team.",
				candidates: [
					new Candidate({
						candidateId: "2",
						name: "Will Smith",
						yearsOfExperience: 10,
						availability: ["Monday", "Tuesday", "Wednesday", "Thursday"],
					}),
				],
				onSiteSchedule: [
					// Note alice johnson's id is 10 and included in the  initial data from createTestData()
					new OnSiteSchedule({ day: "Thursday", interviewerIds: ["10"], candidateId: "2" }),
				],
			}),
		);

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const jobNode = view.root.jobsList.find((job: Job) => job.jobId === targetJobId)!;

		const taskBencharmarkTitle =
			"Remove Alice Johnson from Will Smith onsite interview schedule.";
		completedTasksBenchmark[taskBencharmarkTitle] = {
			status: "success",
			successfulSubTasks: [],
			failedSubTasks: [],
			executionTimeMs: 0,
			totalSubTasks: 1,
		};

		const startTime = Date.now();
		try {
			await aiCollab({
				treeView: view,
				openAI: {
					client: new OpenAI({
						apiKey: OPENAI_API_KEY,
					}),
					options: { model: "gpt-4o" },
				},
				treeNode: view.root,
				prompt: {
					systemRoleContext: SYSTEM_ROLE_CONTEXT,
					userAsk: taskBencharmarkTitle,
				},
				limiters: {
					maxModelCalls: 5,
				},
			});
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
		} catch (error) {
			let errorMessage: string | undefined;
			if (error instanceof Error) {
				errorMessage = error.message;
			}

			completedTasksBenchmark[taskBencharmarkTitle].status = "failure";
			completedTasksBenchmark[taskBencharmarkTitle].errorMessage = errorMessage;
			completedTasksBenchmark[taskBencharmarkTitle].executionTimeMs = Date.now() - startTime;
			return;
		}

		measureSubTaskBenchmark(
			completedTasksBenchmark,
			taskBencharmarkTitle,
			taskBencharmarkTitle,
			() => {
				return {
					status: jobNode.onSiteSchedule[0]?.interviewerIds.length === 0,
				};
			},
		);
	});
});

interface SubTaskMeasurementResult<TestData> {
	status: boolean;
	data?: TestData;
}

function measureSubTaskBenchmark<TestData = undefined>(
	benchmark: BenchmarkTask,
	taskTitle: string,
	subTaskTitle: string,
	measurement: () => SubTaskMeasurementResult<TestData>,
): { status: boolean; data?: TestData } {
	const measurementResult = measurement();
	const benchmarkTask = benchmark[taskTitle];
	if (benchmarkTask) {
		if (measurement().status) {
			benchmarkTask.successfulSubTasks.push(subTaskTitle);
		} else {
			benchmarkTask.failedSubTasks.push(subTaskTitle);
		}

		// Recalculate the status of the benchmark task based on sucessful and failed sub tasks.
		benchmarkTask.status =
			benchmarkTask.successfulSubTasks.length > 0 && benchmarkTask.failedSubTasks.length === 0
				? "success"
				: benchmarkTask.successfulSubTasks.length === 0
					? "failure"
					: "partial-failure";
	} else {
		throw new Error(`Benchmark taskTitle not found ${taskTitle}`);
	}

	return measurementResult;
}

function createTestData(): HRData {
	const interviewers = [
		new Interviewer({
			interviewerId: "10",
			name: "Alice Johnson",
			role: "Technical Lead",
			availability: ["Monday", "Tuesday", "Wednesday"],
		}),
		new Interviewer({
			interviewerId: "20",
			name: "Bob Smith",
			role: "HR Manager",
			availability: ["Monday", "Tuesday", "Wednesday"],
		}),
		new Interviewer({
			interviewerId: "30",
			name: "Charlie Brown",
			role: "Senior Developer",
			availability: ["Thursday", "Friday"],
		}),
		new Interviewer({
			interviewerId: "40",
			name: "Diana Prince",
			role: "Project Manager",
			availability: ["Thursday", "Friday"],
		}),
		new Interviewer({
			interviewerId: "50",
			name: "Ethan Hunt",
			role: "QA Engineer",
			availability: ["Thursday", "Friday"],
		}),
		new Interviewer({
			interviewerId: "60",
			name: "Fiona Gallagher",
			role: "DevOps Engineer",
			availability: ["Friday"],
		}),
		new Interviewer({
			interviewerId: "70",
			name: "George Martin",
			role: "Product Owner",
			availability: ["Monday", "Tuesday", "Thursday", "Friday"],
		}),
	];

	const job = createTestJob();

	const hrData = new HRData({
		jobsList: [job],
		interviewerPool: interviewers,
	});
	return hrData;
}

function createTestJob(): Job {
	const candidates = [
		new Candidate({
			candidateId: "1",
			name: "John Doe",
			yearsOfExperience: 5,
			availability: createFullyAvailable(),
		}),
	];

	const onSiteSchedule = new OnSiteSchedule({
		day: "Monday",
		interviewerIds: ["10", "20", "40"],
		candidateId: "1",
	});

	const job = new Job({
		jobId: "1",
		jobState: "Open",
		jobTitle: "Software Engineer",
		jobDescription: "We are looking for a software engineer to join our team.",
		candidates,
		onSiteSchedule: [onSiteSchedule],
	});

	return job;
}

function createFullyAvailable(): string[] {
	return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
}
