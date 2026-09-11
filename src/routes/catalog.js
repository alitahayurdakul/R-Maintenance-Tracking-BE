import { Router } from "express";

import { audit, CATALOG_ACTIONS, LOG_ACTIONS } from "../lib/audit.js";
import { asyncHandler, badRequest, notFound, pagedResponse, pageParams, sendList } from "../lib/http.js";
import {
  materialOut,
  reasonOut,
  roleOut,
  stageOut,
  subStageOut,
  userOut,
  workflowOut,
} from "../lib/serialize.js";
import {
  Log,
  Material,
  Reason,
  Role,
  Stage,
  SubStage,
  User,
  Workflow,
} from "../models/index.js";

export const catalogRouter = Router();

/**
 * Whether a list comes back bare or wrapped is not a style choice: each
 * frontend handler unwraps one specific key (or no key at all), so `listKey`
 * below mirrors `src/api/handlers/*`.
 */
const crud = ({ path, model, listKey, map, populate = [], build, patch }) => {
  catalogRouter.get(
    path,
    asyncHandler((req, res) =>
      sendList({ req, res, model, key: listKey, map, populate }),
    ),
  );

  catalogRouter.get(
    `${path}/:id`,
    asyncHandler(async (req, res) => {
      const doc = await model.findById(req.params.id).populate(populate);
      if (!doc) throw notFound();
      res.json(map(doc));
    }),
  );

  catalogRouter.post(
    path,
    asyncHandler(async (req, res) => {
      const doc = await model.create(build(req.body ?? {}));
      const saved = await model.findById(doc._id).populate(populate);
      const action = CATALOG_ACTIONS[path]?.create;
      if (action) audit(req, action);
      res.status(201).json({ success: true, data: map(saved) });
    }),
  );

  catalogRouter.put(
    `${path}/:id`,
    asyncHandler(async (req, res) => {
      const update = (patch ?? build)(req.body ?? {});
      const doc = await model
        .findByIdAndUpdate(req.params.id, update, { new: true })
        .populate(populate);
      if (!doc) throw notFound();
      const action = CATALOG_ACTIONS[path]?.update;
      if (action) audit(req, action);
      res.json({ success: true, data: map(doc) });
    }),
  );

  catalogRouter.delete(
    `${path}/:id`,
    asyncHandler(async (req, res) => {
      const doc = await model.findByIdAndDelete(req.params.id);
      if (!doc) throw notFound();
      const action = CATALOG_ACTIONS[path]?.delete;
      if (action) audit(req, action);
      res.json({ success: true });
    }),
  );
};

/* The frontend sends `name`/`desc` from its forms; stored names differ slightly. */

crud({
  path: "/api/materials",
  model: Material,
  listKey: "materials",
  map: materialOut,
  build: (body) => ({
    name: body.name,
    materialCode: body.materialCode ?? body.code ?? "",
    serialNumber: body.serialNumber ?? "",
    description: body.description ?? body.desc ?? "",
    creator: body.creator,
    editor: body.editor,
  }),
});

crud({
  path: "/api/substages",
  model: SubStage,
  listKey: "subStages",
  map: subStageOut,
  populate: ["materials"],
  build: (body) => ({
    name: body.name,
    description: body.description ?? body.desc ?? "",
    materials: body.materials ?? [],
    creator: body.creator,
    editor: body.editor,
  }),
});

crud({
  path: "/api/stages",
  model: Stage,
  listKey: "stages",
  map: stageOut,
  populate: ["materials", { path: "subStages", populate: "materials" }],
  build: (body) => ({
    name: body.name,
    description: body.description ?? body.desc ?? "",
    plannedOrder: body.plannedOrder ?? null,
    materials: body.materials ?? [],
    subStages: body.subStages ?? [],
    creator: body.creator,
    editor: body.editor,
  }),
});

crud({
  path: "/api/reasons",
  model: Reason,
  listKey: null,
  map: reasonOut,
  build: (body) => ({
    name: body.name,
    description: body.description ?? body.desc ?? "",
    creator: body.creator,
    editor: body.editor,
  }),
});

crud({
  path: "/api/roles",
  model: Role,
  listKey: null,
  map: roleOut,
  build: (body) => ({
    roleName: body.roleName ?? body.name,
    roleDescription: body.roleDescription ?? body.desc ?? "",
    permissions: body.permissions ?? [],
    creator: body.creator,
    editor: body.editor,
  }),
});

/** Workflows live under "favorite-processes" — the frontend's own naming. */
crud({
  path: "/api/favorite-processes",
  model: Workflow,
  listKey: null,
  map: workflowOut,
  populate: [{ path: "stages.stageInfo" }],
  build: (body) => ({
    name: body.name,
    description: body.description ?? body.desc ?? "",
    stages: (body.stages ?? []).map((entry, index) => ({
      stageInfo: entry.stageInfo ?? entry.id ?? entry,
      plannedOrder: entry.plannedOrder ?? index + 1,
    })),
    creator: body.creator,
    editor: body.editor,
  }),
});

/* Users: created through /register, so only read, update and delete here. */

catalogRouter.get(
  "/api/users",
  asyncHandler((req, res) =>
    sendList({ req, res, model: User, key: null, map: userOut, populate: ["role"] }),
  ),
);

catalogRouter.get(
  "/api/users/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).populate("role");
    if (!user) throw notFound();
    res.json(userOut(user));
  }),
);

catalogRouter.put(
  "/api/users/:id",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        ...(body.fullname !== undefined && { fullname: body.fullname }),
        ...(body.email !== undefined && { email: String(body.email).toLowerCase() }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.department !== undefined && { department: body.department }),
        ...(body.role !== undefined && { role: body.role || null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        editor: body.editor,
      },
      { new: true },
    ).populate("role");

    if (!user) throw notFound();
    audit(req, LOG_ACTIONS.USER_UPDATE);
    res.json({ success: true, data: userOut(user) });
  }),
);

catalogRouter.delete(
  "/api/users/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) throw notFound();
    audit(req, LOG_ACTIONS.USER_DELETE);
    res.json({ success: true });
  }),
);

catalogRouter.put(
  "/api/users/:id/password",
  asyncHandler(async (req, res) => {
    const { default: bcrypt } = await import("bcryptjs");
    const { currentPassword, newPassword } = req.body ?? {};
    if (!newPassword) throw badRequest("newPassword is required");

    const user = await User.findById(req.params.id);
    if (!user) throw notFound();

    if (currentPassword) {
      const matches = await bcrypt.compare(String(currentPassword), user.password);
      if (!matches) throw badRequest("The current password is wrong");
    }

    user.password = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    audit(req, LOG_ACTIONS.USER_PASSWORD_CHANGE);
    res.json({ success: true });
  }),
);

/* ---------------------------------------------------------------------- logs */

/**
 * GET /api/logs — the operations table.
 *
 * Newest first and always paged: the page has no "all logs" mode, and an audit
 * trail is the one list that grows without bound.
 */
catalogRouter.get(
  "/api/logs",
  asyncHandler(async (req, res) => {
    const { pageNumber, pageSize, skip } = pageParams(req);
    const [docs, totalCount] = await Promise.all([
      Log.find({}).sort({ operationTime: -1 }).skip(skip).limit(pageSize),
      Log.countDocuments({}),
    ]);

    res.json(
      pagedResponse({
        data: docs.map((log) => ({
          _id: String(log._id),
          userId: log.userId ?? "",
          fullname: log.fullname ?? "",
          action: log.action,
          operationTime: log.operationTime,
        })),
        totalCount,
        pageNumber,
        pageSize,
      }),
    );
  }),
);
