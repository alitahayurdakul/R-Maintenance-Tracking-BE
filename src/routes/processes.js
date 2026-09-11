import { Router } from "express";

import { audit, LOG_ACTIONS } from "../lib/audit.js";
import { asyncHandler, badRequest, isPaged, notFound, pagedResponse, pageParams } from "../lib/http.js";
import { processDetailOut, processOut, subStageEntryOut } from "../lib/serialize.js";
import { Process, Stage, Workflow } from "../models/index.js";

export const processesRouter = Router();

const populateProcess = [
  "project",
  { path: "train", populate: { path: "trainType" } },
  "wagon",
  { path: "workflow", populate: { path: "stages.stageInfo" } },
  { path: "entries.stageId" },
  { path: "entries.subStages.subStageId", populate: { path: "materials" } },
  // The material now sits one level down, next to its serial number.
  { path: "entries.subStages.materials.material" },
  { path: "entries.subStages.delayReasons" },
];

/**
 * Builds the stage entries a process runs through, from its workflow.
 *
 * Doing it at start time freezes the plan into the process: editing the
 * workflow afterwards must not silently rewrite work that is already underway.
 */
const entriesFromWorkflow = async (workflowId) => {
  const workflow = await Workflow.findById(workflowId).populate("stages.stageInfo");
  if (!workflow) throw badRequest("The workflow does not exist");

  const stageIds = (workflow.stages ?? []).map((entry) => entry.stageInfo?._id);
  const stages = await Stage.find({ _id: { $in: stageIds } }).populate("subStages");
  const byId = new Map(stages.map((stage) => [String(stage._id), stage]));

  return (workflow.stages ?? [])
    .slice()
    .sort((a, b) => (a.plannedOrder ?? 0) - (b.plannedOrder ?? 0))
    .map((entry, index) => {
      const stage = byId.get(String(entry.stageInfo?._id));
      return {
        stageId: stage?._id ?? entry.stageInfo?._id,
        stageName: stage?.name ?? entry.stageInfo?.name ?? "",
        plannedOrder: entry.plannedOrder ?? index + 1,
        canSkip: false,
        isSkipped: false,
        startedAt: null,
        endedAt: null,
        subStages: (stage?.subStages ?? []).map((subStage) => ({
          subStageId: subStage._id,
          name: subStage.name,
          status: "PENDING",
          // The materials the sub-stage calls for, with no serial yet.
          materials: (subStage.materials ?? []).map((material) => ({
            material,
            serialNumber: "",
          })),
        })),
      };
    });
};

/**
 * GET /api/processes answers three different shapes, because three different
 * frontend handlers read it: a paged envelope for the history table, a wrapped
 * `{ processes }` for a train+wagon lookup, and a bare array for the grid.
 */
processesRouter.get(
  "/api/processes",
  asyncHandler(async (req, res) => {
    const { status, projectId, trainId, wagonId } = req.query;

    const filter = {
      ...(status && { status }),
      ...(projectId && { project: projectId }),
      ...(trainId && { train: trainId }),
      ...(wagonId && { wagon: wagonId }),
    };

    if (isPaged(req)) {
      const { pageNumber, pageSize, skip } = pageParams(req);
      const [docs, totalCount] = await Promise.all([
        Process.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .populate(populateProcess),
        Process.countDocuments(filter),
      ]);
      return res.json(
        pagedResponse({
          data: docs.map(processOut),
          totalCount,
          pageNumber,
          pageSize,
        }),
      );
    }

    const docs = await Process.find(filter)
      .sort({ createdAt: -1 })
      .populate(populateProcess);
    const list = docs.map(processOut);

    if (wagonId) return res.json({ count: list.length, processes: list });
    return res.json(list);
  }),
);

/** The train detail page asks for every process of one train. */
processesRouter.get(
  "/api/processes/search",
  asyncHandler(async (req, res) => {
    const { trainId } = req.query;
    const docs = await Process.find(trainId ? { train: trainId } : {})
      .sort({ createdAt: -1 })
      .populate(populateProcess);
    res.json({ count: docs.length, processes: docs.map(processOut) });
  }),
);

processesRouter.post(
  "/api/processes/search",
  asyncHandler(async (req, res) => {
    const { trainId } = req.body ?? {};
    const docs = await Process.find(trainId ? { train: trainId } : {})
      .sort({ createdAt: -1 })
      .populate(populateProcess);
    res.json({ count: docs.length, processes: docs.map(processOut) });
  }),
);

processesRouter.get(
  "/api/processes/statistics",
  asyncHandler(async (_req, res) => {
    const processes = await Process.find({}).populate(populateProcess);
    const stages = new Map();

    processes.forEach((process) => {
      (process.entries ?? []).forEach((entry) => {
        const key = entry.stageName ?? String(entry.stageId);
        const row = stages.get(key) ?? { name: key, total: 0, completed: 0 };
        row.total += 1;
        if (entry.endedAt) row.completed += 1;
        stages.set(key, row);
      });
    });

    res.json({ stages: [...stages.values()] });
  }),
);

processesRouter.get(
  "/api/processes/process-statistics",
  asyncHandler(async (_req, res) => {
    const [active, completed, cancelled] = await Promise.all([
      Process.countDocuments({ status: "ACTIVE" }),
      Process.countDocuments({ status: "COMPLETED" }),
      Process.countDocuments({ status: "CANCELLED" }),
    ]);
    res.json({ active, completed, cancelled, total: active + completed + cancelled });
  }),
);

/** POST /api/processes/start — the "Yeni Süreç" form. */
processesRouter.post(
  "/api/processes/start",
  asyncHandler(async (req, res) => {
    const { projectId, trainId, wagonId, workflowId, description, creator } =
      req.body ?? {};

    if (!projectId || !trainId || !workflowId) {
      throw badRequest("projectId, trainId and workflowId are required");
    }

    // The duplicate this rejects is the one the plan exists to prevent: the
    // same job started twice on the same wagon. Deleting the process frees it.
    const existing = await Process.findOne({
      project: projectId,
      train: trainId,
      wagon: wagonId || null,
      workflow: workflowId,
      status: { $ne: "CANCELLED" },
    });
    if (existing) {
      throw badRequest("This job has already been started for that wagon");
    }

    const created = await Process.create({
      project: projectId,
      train: trainId,
      wagon: wagonId || null,
      workflow: workflowId,
      description: description ?? "",
      creator: creator ?? "",
      entries: await entriesFromWorkflow(workflowId),
    });

    const process = await Process.findById(created._id).populate(populateProcess);
    audit(req, LOG_ACTIONS.PROCESS_START);
    // `{ process }` and nothing more: the Next handler wraps this once, and the
    // form reads the id at `responseData.data.process._id`. A second wrapper
    // here pushes it out of reach.
    res.status(201).json({ process: processOut(process) });
  }),
);

processesRouter.get(
  "/api/processes/:id",
  asyncHandler(async (req, res) => {
    const process = await Process.findById(req.params.id).populate(populateProcess);
    if (!process) throw notFound();

    // The page shows "wagon N of M", and M is how many wagons the train carries.
    const totalWagonCount = (process.train?.trainType?.wagons ?? []).length;

    res.json(processDetailOut(process, { totalWagonCount }));
  }),
);

processesRouter.delete(
  "/api/processes/:id",
  asyncHandler(async (req, res) => {
    const process = await Process.findByIdAndDelete(req.params.id);
    if (!process) throw notFound();
    audit(req, LOG_ACTIONS.PROCESS_DELETE);
    res.json({ success: true });
  }),
);

/** The sub-stage rows of one stage of one process. */
processesRouter.get(
  "/api/processes/:processId/stages/:stageId/substages",
  asyncHandler(async (req, res) => {
    const process = await Process.findById(req.params.processId).populate(populateProcess);
    if (!process) throw notFound();

    const entry = (process.entries ?? []).find(
      (item) => String(item.stageId?._id ?? item.stageId) === req.params.stageId,
    );
    if (!entry) throw notFound("Stage not found on this process");

    res.json({
      count: (entry.subStages ?? []).length,
      entryId: String(entry._id),
      subStages: (entry.subStages ?? []).map(subStageEntryOut),
    });
  }),
);

processesRouter.post(
  "/api/processes/:processId/start-stage",
  asyncHandler(async (req, res) => {
    const { stageId, operator } = req.body ?? {};
    const process = await Process.findById(req.params.processId);
    if (!process) throw notFound();

    const entry = (process.entries ?? []).find(
      (item) => String(item.stageId) === String(stageId),
    );
    if (!entry) throw notFound("Stage not found on this process");

    entry.startedAt = entry.startedAt ?? new Date();
    entry.operator = operator ?? entry.operator;
    await process.save();

    audit(req, LOG_ACTIONS.STAGE_START);
    // 201, not 200: the frontend's startStage handler treats anything else as a
    // failure (`response.status === 201`), so the stage would never open.
    res.status(201).json({ success: true, data: { entryId: String(entry._id) } });
  }),
);

// PATCH is what the frontend sends; PUT is accepted so a hand-made call works.
processesRouter.all(
  "/api/processes/stage-entry/:entryId/close",
  asyncHandler(async (req, res) => {
    const process = await Process.findOne({ "entries._id": req.params.entryId });
    if (!process) throw notFound("Stage entry not found");

    const entry = process.entries.id(req.params.entryId);
    entry.endedAt = new Date();
    entry.subStages.forEach((sub) => {
      if (sub.status !== "COMPLETED") {
        sub.status = "COMPLETED";
        sub.end = sub.end ?? new Date();
      }
    });

    await process.save();
    audit(req, LOG_ACTIONS.STAGE_COMPLETE);
    res.json({ success: true });
  }),
);

// The frontend posts here rather than putting; both verbs are accepted.
processesRouter.all(
  "/api/processes/:processId/complete",
  asyncHandler(async (req, res) => {
    const process = await Process.findById(req.params.processId);
    if (!process) throw notFound();

    process.status = "COMPLETED";
    process.completedAt = new Date();
    await process.save();

    audit(req, LOG_ACTIONS.PROCESS_COMPLETE);
    res.json({ success: true });
  }),
);

/**
 * Start, save or finish one sub-stage.
 *
 * The modal sends `{ status, description, delayReasons: [{reasonId, name}],
 * materials: [{materialId, serialNumber}] }` — ids nested inside objects, and
 * the status as one of the STATUS codes rather than a number.
 */
processesRouter.put(
  "/api/substages/processes/:processId/stages/:stageId/substages/:subStageId",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const process = await Process.findById(req.params.processId);
    if (!process) throw notFound();

    const entry = (process.entries ?? []).find(
      (item) => String(item.stageId) === req.params.stageId,
    );
    if (!entry) throw notFound("Stage not found on this process");

    const sub = (entry.subStages ?? []).find(
      (item) =>
        String(item._id) === req.params.subStageId ||
        String(item.subStageId) === req.params.subStageId,
    );
    if (!sub) throw notFound("Sub-stage not found on this stage");

    const status =
      body.status === "COMPLETED" || body.status === 2
        ? "COMPLETED"
        : body.status === "PENDING"
          ? "PENDING"
          : "ACTIVE";

    sub.status = status;
    if (status !== "PENDING") {
      sub.start = sub.start ?? body.start ?? new Date();
      entry.startedAt = entry.startedAt ?? new Date();
    }
    sub.end = status === "COMPLETED" ? new Date() : null;

    if (body.description !== undefined) sub.description = body.description;
    if (body.images !== undefined) sub.images = body.images;

    if (body.delayReasons !== undefined) {
      sub.delayReasons = (body.delayReasons ?? [])
        .map((reason) => reason?.reasonId ?? reason?._id ?? reason)
        .filter(Boolean);
    }

    if (body.materials !== undefined) {
      sub.materials = (body.materials ?? [])
        .map((used) => ({
          material: used?.materialId ?? used?.material ?? used?._id ?? used,
          serialNumber: used?.serialNumber ?? "",
        }))
        .filter((used) => used.material);
    }

    // A stage closes itself once nothing is left open inside it.
    if ((entry.subStages ?? []).every((item) => item.status === "COMPLETED")) {
      entry.endedAt = entry.endedAt ?? new Date();
    }

    await process.save();
    if (status === "COMPLETED") audit(req, LOG_ACTIONS.SUB_STAGE_COMPLETE);
    res.json({ success: true });
  }),
);
