import { Router } from "express";

import { audit, LOG_ACTIONS } from "../lib/audit.js";
import { asyncHandler, notFound, sendList } from "../lib/http.js";
import { projectProgress } from "../lib/progress.js";
import { projectOut } from "../lib/serialize.js";
import { Project } from "../models/index.js";

export const projectsRouter = Router();

/**
 * Turns the setup wizard's payload into a stored plan.
 *
 * The wizard sends `items`, `exclusions` and the selected trains/wagons; the
 * targets are not taken from the request, they are recomputed from the plan
 * whenever progress is asked for. That is the whole point of the plan: the
 * target can never drift from what was actually planned.
 */
const buildPlan = (body) => {
  if (!body.trainIds && !body.items) return undefined;

  return {
    trainType: body.trainTypeId || null,
    trains: body.trainIds ?? [],
    wagons: body.wagonIds ?? [],
    items: (body.items ?? []).map((item) => ({
      workflow: item.workflowId ?? item.workflow,
      scope: item.scope === "TRAIN" ? "TRAIN" : "WAGON",
    })),
    exclusions: body.exclusions ?? {},
    materials: body.materialIds ?? [],
  };
};

projectsRouter.get(
  "/api/projects",
  asyncHandler((req, res) =>
    sendList({
      req,
      res,
      model: Project,
      key: "projects",
      query: req.query.status ? { status: req.query.status } : {},
      map: projectOut,
    }),
  ),
);

/** Declared before `/:id` so "progress" is not taken for an object id. */
projectsRouter.get(
  "/api/projects/:id/progress",
  asyncHandler(async (req, res) => {
    const payload = await projectProgress(req.params.id);
    if (!payload) throw notFound("Project not found");
    res.json(payload);
  }),
);

projectsRouter.get(
  "/api/projects/:id",
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) throw notFound();
    res.json(projectOut(project));
  }),
);

projectsRouter.post(
  "/api/projects",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const project = await Project.create({
      name: body.name,
      projectCode: body.projectCode ?? body.code ?? "",
      status: body.status || "ACTIVE",
      description: body.description ?? body.desc ?? "",
      totalTrainCount: body.totalTrainCount ?? null,
      totalSubStagePerTrain: body.totalSubStagePerTrain ?? null,
      plan: buildPlan(body),
      creator: body.creator,
    });
    audit(req, LOG_ACTIONS.PROJECT_CREATE);
    res.status(201).json({ success: true, data: projectOut(project) });
  }),
);

projectsRouter.put(
  "/api/projects/:id",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const plan = buildPlan(body);

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.projectCode !== undefined || body.code !== undefined
          ? { projectCode: body.projectCode ?? body.code }
          : {}),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.description !== undefined || body.desc !== undefined
          ? { description: body.description ?? body.desc }
          : {}),
        ...(body.totalTrainCount !== undefined && {
          totalTrainCount: body.totalTrainCount,
        }),
        ...(body.totalSubStagePerTrain !== undefined && {
          totalSubStagePerTrain: body.totalSubStagePerTrain,
        }),
        ...(plan !== undefined && { plan }),
        lastUpdatedBy: body.editor ?? body.lastUpdatedBy,
      },
      { new: true },
    );

    if (!project) throw notFound();
    res.json({ success: true, data: projectOut(project) });
  }),
);

projectsRouter.delete(
  "/api/projects/:id",
  asyncHandler(async (req, res) => {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) throw notFound();
    res.json({ success: true });
  }),
);
