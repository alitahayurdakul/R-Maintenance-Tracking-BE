/**
 * Shapes documents into exactly what the frontend's handlers read.
 *
 * Field names are not negotiable: `src/api/handlers/*` unwraps specific keys and
 * `src/types/*` declares the rest, so anything renamed here silently renders as
 * "-" in the UI.
 */

const id = (value) => (value?._id ? String(value._id) : value ? String(value) : null);

const minutesBetween = (start, end) =>
  !start ? 0 : Math.max(0, Math.round(((end ?? new Date()) - start) / 60000));

export const materialOut = (material) => ({
  _id: id(material),
  name: material.name,
  materialCode: material.materialCode ?? "",
  serialNumber: material.serialNumber ?? "",
  description: material.description ?? "",
  isActive: material.isActive !== false,
  creator: material.creator ?? "",
  editor: material.editor ?? "",
  createdAt: material.createdAt,
  updatedAt: material.updatedAt,
});

export const subStageOut = (subStage) => ({
  _id: id(subStage),
  name: subStage.name,
  description: subStage.description ?? "",
  isActive: subStage.isActive !== false,
  materials: (subStage.materials ?? []).map((m) =>
    m?.name ? materialOut(m) : id(m),
  ),
  creator: subStage.creator ?? "",
  editor: subStage.editor ?? "",
  createdAt: subStage.createdAt,
  updatedAt: subStage.updatedAt,
});

export const stageOut = (stage) => ({
  _id: id(stage),
  name: stage.name,
  description: stage.description ?? "",
  plannedOrder: stage.plannedOrder ?? null,
  isActive: stage.isActive !== false,
  materials: (stage.materials ?? []).map((m) =>
    m?.name ? materialOut(m) : id(m),
  ),
  subStages: (stage.subStages ?? []).map((s) =>
    s?.name ? subStageOut(s) : id(s),
  ),
  creator: stage.creator ?? "",
  editor: stage.editor ?? "",
  createdAt: stage.createdAt,
  updatedAt: stage.updatedAt,
});

export const workflowOut = (workflow) => ({
  _id: id(workflow),
  name: workflow.name,
  description: workflow.description ?? "",
  isActive: workflow.isActive !== false,
  stages: (workflow.stages ?? []).map((entry) => ({
    stageInfo: entry.stageInfo?.name
      ? {
          _id: id(entry.stageInfo),
          name: entry.stageInfo.name,
          description: entry.stageInfo.description ?? "",
          plannedOrder: entry.stageInfo.plannedOrder ?? null,
          isActive: entry.stageInfo.isActive !== false,
        }
      : { _id: id(entry.stageInfo) },
    plannedOrder: entry.plannedOrder,
  })),
  creator: workflow.creator ?? "",
  editor: workflow.editor ?? "",
  createdAt: workflow.createdAt,
  updatedAt: workflow.updatedAt,
});

export const reasonOut = (reason) => ({
  _id: id(reason),
  name: reason.name,
  description: reason.description ?? "",
  isActive: reason.isActive !== false,
  creator: reason.creator ?? "",
  editor: reason.editor ?? "",
  createdAt: reason.createdAt,
  updatedAt: reason.updatedAt,
});

export const roleOut = (role) => ({
  _id: id(role),
  roleName: role.roleName,
  roleDescription: role.roleDescription ?? "",
  permissions: role.permissions ?? [],
  creator: role.creator ?? "",
  editor: role.editor ?? "",
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
});

export const userOut = (user) => ({
  _id: id(user),
  fullname: user.fullname,
  email: user.email,
  phone: user.phone ?? "",
  department: user.department ?? "",
  role: user.role?.roleName
    ? { _id: id(user.role), roleName: user.role.roleName }
    : id(user.role),
  isActive: user.isActive !== false,
  creator: user.creator ?? "",
  editor: user.editor ?? "",
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

/** `trainIds` is what the frontend reads to tell which trains carry a wagon. */
export const wagonOut = (wagon, { order, trainIds = [] } = {}) => ({
  _id: id(wagon),
  wagonNo: wagon.wagonNo,
  description: wagon.description ?? "",
  order: order ?? wagon.order ?? 1,
  isActive: wagon.isActive !== false,
  trainIds,
  creator: wagon.creator ?? "",
  editor: wagon.editor ?? "",
  createdAt: wagon.createdAt,
  updatedAt: wagon.updatedAt,
});

export const trainTypeOut = (trainType, { trainCount = 0 } = {}) => ({
  _id: id(trainType),
  name: trainType.name,
  code: trainType.code ?? "",
  description: trainType.description ?? "",
  isActive: trainType.isActive !== false,
  trainCount,
  wagons: (trainType.wagons ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((entry) =>
      entry.wagon?.wagonNo
        ? wagonOut(entry.wagon, { order: entry.order })
        : { _id: id(entry.wagon), order: entry.order },
    ),
  creator: trainType.creator ?? "",
  editor: trainType.editor ?? "",
  createdAt: trainType.createdAt,
  updatedAt: trainType.updatedAt,
});

/** A train's wagons are its type's wagons. There is no other source. */
export const trainWagons = (train) =>
  (train.trainType?.wagons ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((entry) => entry.wagon?.wagonNo)
    .map((entry) =>
      wagonOut(entry.wagon, { order: entry.order, trainIds: [id(train)] }),
    );

export const trainOut = (train) => ({
  _id: id(train),
  trainSetNo: train.trainSetNo,
  desc: train.desc ?? "",
  description: train.desc ?? "",
  trainModel: train.trainModel ?? null,
  year: train.year,
  trainTypeId: id(train.trainType),
  trainTypeName: train.trainType?.name ?? null,
  wagons: trainWagons(train),
  creator: train.creator ?? "",
  editor: train.editor ?? "",
  createdAt: train.createdAt,
  updatedAt: train.updatedAt,
});

export const projectOut = (project) => ({
  _id: id(project),
  name: project.name,
  projectCode: project.projectCode ?? "",
  status: project.status,
  description: project.description ?? "",
  totalTrainCount: project.totalTrainCount ?? null,
  totalSubStagePerTrain: project.totalSubStagePerTrain ?? null,
  creator: project.creator ?? "",
  lastUpdatedBy: project.lastUpdatedBy ?? "",
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

/**
 * One row of the active-process grid.
 *
 * `openStage` is the entry that is running right now — the field the cards use
 * to say which stage a train sits in and how long it has been there.
 */
export const processOut = (process) => {
  const entries = process.entries ?? [];
  const open = entries.find((entry) => entry.startedAt && !entry.endedAt);
  const stageCount = process.workflow?.stages?.length ?? entries.length;

  const totalMinutes = entries.reduce(
    (sum, entry) => sum + minutesBetween(entry.startedAt, entry.endedAt),
    0,
  );

  return {
    _id: id(process),
    projectId: id(process.project),
    projectName: process.project?.name ?? "",
    trainId: id(process.train),
    locomotiveNo: process.train?.trainSetNo ?? "",
    wagonId: id(process.wagon),
    wagonNo: process.wagon?.wagonNo ?? "",
    description: process.description ?? "",
    workflowId: id(process.workflow),
    workflowName: process.workflow?.name ?? "",
    fleetOwner: process.fleetOwner ?? "",
    creator: process.creator ?? null,
    editor: process.editor ?? null,
    status: process.status,
    currentStageId: open ? id(open.stageId) : null,
    completedAt: process.completedAt,
    startedAt: process.startedAt,
    createdAt: process.createdAt,
    updatedAt: process.updatedAt,
    __v: 0,
    stageCount,
    entryCount: entries.length,
    totalMinutes,
    completedStageCount: entries.filter((entry) => entry.endedAt).length,
    activeStageCount: entries.filter(
      (entry) => entry.startedAt && !entry.endedAt,
    ).length,
    openStage: open
      ? {
          operator: open.operator ?? "",
          stageId: id(open.stageId),
          stageName: open.stageName ?? open.stageId?.name ?? "",
          startedAt: open.startedAt,
          plannedOrder: open.plannedOrder,
          canSkip: !!open.canSkip,
          isSkipped: !!open.isSkipped,
        }
      : null,
  };
};

/** The sub-stage rows of one stage of one process. */
export const subStageEntryOut = (entry) => ({
  _id: id(entry),
  name: entry.name ?? entry.subStageId?.name ?? "",
  status: entry.status ?? 0,
  start: entry.start,
  end: entry.end,
  description: entry.description ?? "",
  images: entry.images ?? [],
  delayReasons: (entry.delayReasons ?? []).map((reason) =>
    reason?.name ? { _id: id(reason), name: reason.name } : { _id: id(reason) },
  ),
  materials: (entry.materials ?? []).map((material) =>
    material?.name ? materialOut(material) : { _id: id(material) },
  ),
  subStageId: entry.subStageId?.name
    ? {
        _id: id(entry.subStageId),
        name: entry.subStageId.name,
        description: entry.subStageId.description ?? "",
        isActive: entry.subStageId.isActive !== false,
        materials: (entry.subStageId.materials ?? []).map((m) =>
          m?.name ? materialOut(m) : { _id: id(m) },
        ),
      }
    : { _id: id(entry.subStageId) },
});

/**
 * The active-process detail page's payload: `{ process, stages, entries, summary }`.
 *
 * `stages` is the workflow as planned, `entries` the attempts recorded against
 * it. The page pairs them by `stageId`, which is why an entry carries the id as
 * well as the stage object — and why `entries[].\_id` matters: closing a stage
 * posts that id, not the stage's.
 */
export const processDetailOut = (process, { totalWagonCount = 0 } = {}) => {
  const entries = process.entries ?? [];
  const list = processOut(process);

  return {
    process: {
      _id: id(process),
      locomotiveNo: list.locomotiveNo,
      fleetOwner: list.fleetOwner,
      workflowId: list.workflowId,
      workflowName: list.workflowName,
      creator: list.creator ?? "",
      status: process.status,
      currentStageId: list.currentStageId,
      startedAt: process.startedAt,
      completedAt: process.completedAt,
      createdAt: process.createdAt,
      updatedAt: process.updatedAt,
      projectId: list.projectId,
      projectName: list.projectName,
      wagonId: list.wagonId,
      wagonNo: list.wagonNo,
      description: process.description ?? "",
      totalWagonCount,
      wagonOrder: process.wagon?.order ?? 1,
    },

    // `_id` is the stage's own id, not the entry's: the page pairs the two with
    // `entry.stageId._id === stage._id`, and opens a stage's sub-stages by this
    // same value.
    stages: entries.map((entry, index) => ({
      _id: id(entry.stageId),
      entryId: id(entry),
      processInstanceId: id(process),
      stageId: id(entry.stageId),
      name: entry.stageName ?? entry.stageId?.name ?? "",
      description: entry.stageId?.description ?? "",
      order: entry.plannedOrder ?? index + 1,
      plannedOrder: entry.plannedOrder ?? index + 1,
      status: entry.endedAt ? "COMPLETED" : entry.startedAt ? "ACTIVE" : "PENDING",
      isActive: !!entry.startedAt && !entry.endedAt,
      sourceType: "WORKFLOW",
      canSkip: !!entry.canSkip,
      isSkipped: !!entry.isSkipped,
      subStages: (entry.subStages ?? []).map(subStageEntryOut),
    })),

    // Every planned stage has an entry, started or not. Listing only the started
    // ones left a fresh process with an empty `entries` array, which the page
    // reads as "no details found".
    entries: entries.map((entry, index) => ({
      _id: id(entry),
      createdAt: entry.createdAt ?? entry.startedAt,
      updatedAt: entry.updatedAt ?? entry.startedAt,
      durationMinutes: entry.endedAt
        ? minutesBetween(entry.startedAt, entry.endedAt)
        : null,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      isOpen: !entry.endedAt,
      note: entry.note ?? "",
      operator: entry.operator ?? "",
      processInstanceId: id(process),
      sequenceNo: entry.plannedOrder ?? index + 1,
      stageId: {
        _id: id(entry.stageId),
        name: entry.stageName ?? entry.stageId?.name ?? "",
        description: entry.stageId?.description ?? "",
        plannedOrder: entry.plannedOrder ?? index + 1,
      },
      delayNote: entry.delayNote ?? "",
      delayReasonIds: [],
    })),

    summary: {
      totalStages: list.stageCount,
      completedStageCount: list.completedStageCount,
      activeStageCount: list.activeStageCount,
    },
  };
};

export { id as toId, minutesBetween };
