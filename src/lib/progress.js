import { Process, Project, Stage, Train, Workflow } from "../models/index.js";
import { toId } from "./serialize.js";

/** Sub-stages a workflow carries: the sum over its stages. */
export const workflowSubStageCounts = async () => {
  const [workflows, stages] = await Promise.all([
    Workflow.find({}).lean(),
    Stage.find({}).lean(),
  ]);

  const perStage = new Map(
    stages.map((stage) => [String(stage._id), (stage.subStages ?? []).length]),
  );

  return new Map(
    workflows.map((workflow) => [
      String(workflow._id),
      (workflow.stages ?? []).reduce(
        (sum, entry) => sum + (perStage.get(String(entry.stageInfo)) ?? 0),
        0,
      ),
    ]),
  );
};

/**
 * What one train of a project is expected to deliver, in sub-stages.
 *
 * TRAIN-scoped jobs count once; WAGON-scoped jobs count once per wagon of the
 * plan, minus the ones switched off for that exact (train, wagon) pair.
 */
const plannedForTrain = (plan, counts, trainId) => {
  const exclusions = plan.exclusions ?? new Map();
  const readExclusion = (key) =>
    typeof exclusions.get === "function" ? exclusions.get(key) : exclusions[key];

  const trainScoped = (plan.items ?? [])
    .filter((item) => item.scope === "TRAIN")
    .reduce((sum, item) => sum + (counts.get(String(item.workflow)) ?? 0), 0);

  const wagonScoped = (plan.wagons ?? []).reduce((sum, wagonId) => {
    const off = readExclusion(`${trainId}:${String(wagonId)}`) ?? [];
    return (
      sum +
      (plan.items ?? [])
        .filter(
          (item) =>
            item.scope === "WAGON" && !off.includes(String(item.workflow)),
        )
        .reduce(
          (inner, item) => inner + (counts.get(String(item.workflow)) ?? 0),
          0,
        )
    );
  }, 0);

  return trainScoped + wagonScoped;
};

/** Completed sub-stage entries, per train, across a project's processes. */
const completedByTrain = (processes) => {
  const completed = new Map();

  processes.forEach((process) => {
    const done = (process.entries ?? []).reduce(
      (sum, entry) =>
        sum + (entry.subStages ?? []).filter((sub) => sub.status === 2).length,
      0,
    );
    const key = String(process.train);
    completed.set(key, (completed.get(key) ?? 0) + done);
  });

  return completed;
};

const rate = (completed, target) =>
  target > 0 ? Number((completed / target).toFixed(6)) : 0;

/**
 * The progress payload for one project, trains included.
 *
 * A project set up through the wizard carries a plan and everything is derived
 * from it; one created before that falls back to the two typed numbers, which is
 * the arrangement the plan replaces.
 */
export const projectProgress = async (projectId) => {
  const project = await Project.findById(projectId)
    .populate({ path: "plan.trains" })
    .lean();

  if (!project) return null;

  const counts = await workflowSubStageCounts();
  const plan = project.plan ?? null;

  const planTrainIds = (plan?.trains ?? []).map((train) =>
    String(train?._id ?? train),
  );

  const trains = planTrainIds.length
    ? await Train.find({ _id: { $in: planTrainIds } }).lean()
    : await Train.find({}).lean();

  const processes = await Process.find({
    project: projectId,
    status: { $ne: "CANCELLED" },
  }).lean();

  const completed = completedByTrain(processes);

  const perTrainFallback = project.totalSubStagePerTrain ?? 0;

  const trainRows = trains.map((train) => {
    const trainId = String(train._id);
    const target = plan
      ? plannedForTrain(plan, counts, trainId)
      : perTrainFallback;
    const done = completed.get(trainId) ?? 0;
    const trainProcesses = processes.filter(
      (process) => String(process.train) === trainId,
    );

    return {
      _id: trainId,
      trainSetNo: train.trainSetNo,
      trainModel: train.trainModel ?? null,
      processCount: trainProcesses.length,
      activeProcessCount: trainProcesses.filter(
        (process) => process.status === "ACTIVE",
      ).length,
      targetSubStageCount: target,
      totalSubStageCount: done,
      completedSubStageCount: done,
      remainingSubStageCount: Math.max(0, target - done),
      completionRate: rate(done, target),
    };
  });

  const targetSubStageCount = plan
    ? trainRows.reduce((sum, row) => sum + row.targetSubStageCount, 0)
    : (project.totalTrainCount ?? 0) * (project.totalSubStagePerTrain ?? 0);

  const completedSubStageCount = trainRows.reduce(
    (sum, row) => sum + row.completedSubStageCount,
    0,
  );

  return {
    project: {
      _id: String(project._id),
      name: project.name,
      projectCode: project.projectCode ?? "",
      status: project.status,
      totalTrainCount: plan ? trainRows.length : project.totalTrainCount,
      totalSubStagePerTrain: plan
        ? (trainRows[0]?.targetSubStageCount ?? 0)
        : project.totalSubStagePerTrain,
    },
    targetSubStageCount,
    completedSubStageCount,
    remainingSubStageCount: Math.max(
      0,
      targetSubStageCount - completedSubStageCount,
    ),
    completionRate: rate(completedSubStageCount, targetSubStageCount),
    trainCount: {
      planned: plan ? trainRows.length : (project.totalTrainCount ?? 0),
      started: trainRows.filter((row) => row.processCount > 0).length,
    },
    trains: trainRows,
  };
};

export { toId };
