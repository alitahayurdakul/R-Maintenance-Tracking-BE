import { Router } from "express";

import { asyncHandler, notFound, sendList } from "../lib/http.js";
import { trainOut, trainTypeOut, wagonOut } from "../lib/serialize.js";
import { Process, Train, TrainType, Wagon } from "../models/index.js";

export const fleetRouter = Router();

const wagonEntries = (list = []) =>
  list.map((entry, index) => ({
    wagon: entry.id ?? entry.wagon ?? entry._id ?? entry,
    order: entry.order ?? index + 1,
  }));

/* --------------------------------------------------------------- wagons ---- */

/** Which trains carry a wagon — read straight off the types that include it. */
const trainIdsByWagon = async () => {
  const [types, trains] = await Promise.all([
    TrainType.find({}).lean(),
    Train.find({}).lean(),
  ]);

  const typeToTrains = new Map();
  trains.forEach((train) => {
    if (!train.trainType) return;
    const key = String(train.trainType);
    typeToTrains.set(key, [...(typeToTrains.get(key) ?? []), String(train._id)]);
  });

  const byWagon = new Map();
  types.forEach((type) => {
    (type.wagons ?? []).forEach((entry) => {
      const key = String(entry.wagon);
      byWagon.set(key, [
        ...(byWagon.get(key) ?? []),
        ...(typeToTrains.get(String(type._id)) ?? []),
      ]);
    });
  });

  // Trains that still carry their own wagon list rather than a type.
  trains.forEach((train) => {
    (train.wagons ?? []).forEach((entry) => {
      const key = String(entry.wagon);
      byWagon.set(key, [...(byWagon.get(key) ?? []), String(train._id)]);
    });
  });

  return byWagon;
};

fleetRouter.get(
  "/api/wagons",
  asyncHandler(async (req, res) => {
    const byWagon = await trainIdsByWagon();
    return sendList({
      req,
      res,
      model: Wagon,
      key: "wagons",
      sort: { order: 1, createdAt: 1 },
      map: (wagon) =>
        wagonOut(wagon, {
          trainIds: [...new Set(byWagon.get(String(wagon._id)) ?? [])],
        }),
    });
  }),
);

fleetRouter.get(
  "/api/wagons/:id",
  asyncHandler(async (req, res) => {
    const wagon = await Wagon.findById(req.params.id);
    if (!wagon) throw notFound();
    res.json(wagonOut(wagon));
  }),
);

fleetRouter.post(
  "/api/wagons",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const wagon = await Wagon.create({
      wagonNo: body.wagonNo ?? body.name,
      description: body.description ?? body.desc ?? "",
      order: body.order ?? 1,
      creator: body.creator,
    });
    res.status(201).json({ success: true, data: wagonOut(wagon) });
  }),
);

fleetRouter.put(
  "/api/wagons/:id",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const wagon = await Wagon.findByIdAndUpdate(
      req.params.id,
      {
        ...(body.wagonNo !== undefined || body.name !== undefined
          ? { wagonNo: body.wagonNo ?? body.name }
          : {}),
        ...(body.description !== undefined || body.desc !== undefined
          ? { description: body.description ?? body.desc }
          : {}),
        ...(body.order !== undefined && { order: body.order }),
        editor: body.editor,
      },
      { new: true },
    );
    if (!wagon) throw notFound();
    res.json({ success: true, data: wagonOut(wagon) });
  }),
);

fleetRouter.delete(
  "/api/wagons/:id",
  asyncHandler(async (req, res) => {
    const wagon = await Wagon.findByIdAndDelete(req.params.id);
    if (!wagon) throw notFound();
    res.json({ success: true });
  }),
);

/* ----------------------------------------------------------- train types ---- */

fleetRouter.get(
  "/api/train-types",
  asyncHandler(async (req, res) => {
    const trains = await Train.find({}).lean();
    const countByType = new Map();
    trains.forEach((train) => {
      if (!train.trainType) return;
      const key = String(train.trainType);
      countByType.set(key, (countByType.get(key) ?? 0) + 1);
    });

    return sendList({
      req,
      res,
      model: TrainType,
      key: "trainTypes",
      populate: [{ path: "wagons.wagon" }],
      map: (type) =>
        trainTypeOut(type, { trainCount: countByType.get(String(type._id)) ?? 0 }),
    });
  }),
);

fleetRouter.get(
  "/api/train-types/:id",
  asyncHandler(async (req, res) => {
    const type = await TrainType.findById(req.params.id).populate("wagons.wagon");
    if (!type) throw notFound();
    const trainCount = await Train.countDocuments({ trainType: type._id });
    res.json(trainTypeOut(type, { trainCount }));
  }),
);

fleetRouter.post(
  "/api/train-types",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const created = await TrainType.create({
      name: body.name,
      code: body.code ?? "",
      description: body.description ?? body.desc ?? "",
      wagons: wagonEntries(body.wagons),
      creator: body.creator,
    });
    const type = await TrainType.findById(created._id).populate("wagons.wagon");
    res.status(201).json({ success: true, data: trainTypeOut(type) });
  }),
);

fleetRouter.put(
  "/api/train-types/:id",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const type = await TrainType.findByIdAndUpdate(
      req.params.id,
      {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.description !== undefined || body.desc !== undefined
          ? { description: body.description ?? body.desc }
          : {}),
        ...(body.wagons !== undefined && { wagons: wagonEntries(body.wagons) }),
        editor: body.editor,
      },
      { new: true },
    ).populate("wagons.wagon");
    if (!type) throw notFound();
    res.json({ success: true, data: trainTypeOut(type) });
  }),
);

fleetRouter.delete(
  "/api/train-types/:id",
  asyncHandler(async (req, res) => {
    const type = await TrainType.findByIdAndDelete(req.params.id);
    if (!type) throw notFound();
    await Train.updateMany({ trainType: type._id }, { trainType: null });
    res.json({ success: true });
  }),
);

/* --------------------------------------------------------------- trains ---- */

const trainPopulate = [
  { path: "trainType", populate: { path: "wagons.wagon" } },
  { path: "wagons.wagon" },
];

/**
 * `/api/trains` answers with a bare array — `getTrains` in the frontend passes
 * the body straight through — while the paged form returns the table envelope.
 */
fleetRouter.get(
  "/api/trains",
  asyncHandler((req, res) =>
    sendList({
      req,
      res,
      model: Train,
      key: null,
      populate: trainPopulate,
      map: trainOut,
    }),
  ),
);

/** Placed before `/api/trains/:id` so "with-processes" is not read as an id. */
fleetRouter.get(
  "/api/trains/with-processes",
  asyncHandler(async (_req, res) => {
    const [trains, processes] = await Promise.all([
      Train.find({}).populate(trainPopulate),
      Process.find({}).populate("project").lean(),
    ]);

    const rows = trains.map((train) => {
      const own = processes.filter(
        (process) => String(process.train) === String(train._id),
      );
      const completedSubStages = own.reduce(
        (sum, process) =>
          sum +
          (process.entries ?? []).reduce(
            (inner, entry) =>
              inner +
              (entry.subStages ?? []).filter((sub) => sub.status === 2).length,
            0,
          ),
        0,
      );
      const project = own.find((process) => process.project)?.project ?? null;
      const last = own
        .map((process) => process.updatedAt)
        .sort((a, b) => new Date(b) - new Date(a))[0];

      const base = trainOut(train);

      return {
        ...base,
        totalProcessCount: own.length,
        activeProcessCount: own.filter((p) => p.status === "ACTIVE").length,
        completedProcessCount: own.filter((p) => p.status === "COMPLETED").length,
        lastProcessAt: last ?? null,
        projectId: project ? String(project._id) : undefined,
        projectName: project?.name,
        totalTrainCount: project?.totalTrainCount ?? undefined,
        totalSubStagePerTrain: project?.totalSubStagePerTrain ?? undefined,
        completedSubStages,
      };
    });

    res.json({ count: rows.length, trains: rows });
  }),
);

fleetRouter.get(
  "/api/trains/:id",
  asyncHandler(async (req, res) => {
    const train = await Train.findById(req.params.id).populate(trainPopulate);
    if (!train) throw notFound();
    res.json(trainOut(train));
  }),
);

fleetRouter.post(
  "/api/trains",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const created = await Train.create({
      trainSetNo: body.trainName ?? body.trainSetNo,
      desc: body.desc ?? "",
      trainModel: body.trainModel ?? null,
      trainType: body.trainTypeId ?? body.trainType ?? null,
      wagons: wagonEntries(body.wagons),
      creator: body.creator,
    });
    const train = await Train.findById(created._id).populate(trainPopulate);
    res.status(201).json({ success: true, data: trainOut(train) });
  }),
);

fleetRouter.put(
  "/api/trains/:id",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const train = await Train.findByIdAndUpdate(
      req.params.id,
      {
        ...(body.trainName !== undefined || body.trainSetNo !== undefined
          ? { trainSetNo: body.trainName ?? body.trainSetNo }
          : {}),
        ...(body.desc !== undefined && { desc: body.desc }),
        ...(body.trainModel !== undefined && { trainModel: body.trainModel }),
        ...(body.trainTypeId !== undefined && { trainType: body.trainTypeId || null }),
        ...(body.wagons !== undefined && { wagons: wagonEntries(body.wagons) }),
        editor: body.editor,
      },
      { new: true },
    ).populate(trainPopulate);
    if (!train) throw notFound();
    res.json({ success: true, data: trainOut(train) });
  }),
);

fleetRouter.delete(
  "/api/trains/:id",
  asyncHandler(async (req, res) => {
    const train = await Train.findByIdAndDelete(req.params.id);
    if (!train) throw notFound();
    res.json({ success: true });
  }),
);
