import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import { connectDb } from "./db.js";
import {
  Material,
  Process,
  Project,
  Reason,
  Role,
  Stage,
  SubStage,
  Train,
  TrainType,
  User,
  Wagon,
  Workflow,
} from "./models/index.js";

/**
 * Fills an empty database with enough to exercise every page: a signed-in user
 * with full permissions, a train type with its wagons, two trains of that type,
 * a workflow whose stages carry sub-stages, and a project planned against them.
 *
 * Safe to re-run: it clears the collections it owns first.
 */
const seed = async () => {
  await connectDb();

  await Promise.all(
    [Role, User, Wagon, TrainType, Train, Material, SubStage, Stage, Workflow, Reason, Project, Process].map(
      (model) => model.deleteMany({}),
    ),
  );

  /* roles and users ------------------------------------------------------- */

  const RESOURCES = ["activeProcess", "user", "role", "stage"];
  const ACTIONS = ["read", "write", "delete", "manage"];

  const adminRole = await Role.create({
    roleName: "Yönetici",
    roleDescription: "Tüm yetkiler",
    permissions: RESOURCES.flatMap((resource) =>
      ACTIONS.map((action) => `${resource}:${action}`),
    ),
    creator: "seed",
  });

  const operatorRole = await Role.create({
    roleName: "Operatör",
    roleDescription: "Süreçleri yürütür, yönetim yapamaz",
    permissions: ["activeProcess:read", "activeProcess:write", "stage:read"],
    creator: "seed",
  });

  const admin = await User.create({
    fullname: "TMS Admin",
    email: "admin@tms.local",
    password: await bcrypt.hash("Admin123!", 10),
    phone: "5550000000",
    department: "Bakım",
    role: adminRole._id,
    creator: "seed",
  });

  await User.create({
    fullname: "Ali Operatör",
    email: "operator@tms.local",
    password: await bcrypt.hash("Operator123!", 10),
    department: "Atölye",
    role: operatorRole._id,
    creator: "seed",
  });

  /* rolling stock --------------------------------------------------------- */

  const [tcb, tcf] = await Wagon.create([
    { wagonNo: "TCB", description: "Sürücü vagonu B", order: 1, creator: "seed" },
    { wagonNo: "TCF", description: "Sürücü vagonu F", order: 2, creator: "seed" },
  ]);

  const emuType = await TrainType.create({
    name: "EMU 2 vagonlu",
    code: "EMU-2",
    description: "İki vagonlu elektrikli set",
    wagons: [
      { wagon: tcb._id, order: 1 },
      { wagon: tcf._id, order: 2 },
    ],
    creator: "seed",
  });

  const trains = await Train.create([
    { trainSetNo: "TR-1", desc: "İlk set", trainType: emuType._id, creator: "seed" },
    { trainSetNo: "TR2", desc: "İkinci set", trainType: emuType._id, creator: "seed" },
    { trainSetNo: "TR3", desc: "Üçüncü set", trainType: emuType._id, creator: "seed" },
  ]);

  /* catalogue ------------------------------------------------------------- */

  const materials = await Material.create([
    { name: "Fren balatası", materialCode: "FRN-001", creator: "seed" },
    { name: "Conta seti", materialCode: "CNT-014", creator: "seed" },
    { name: "Yağ filtresi", materialCode: "YAG-220", creator: "seed" },
  ]);

  const subStages = await SubStage.create([
    { name: "Söküm", description: "Parçanın sökülmesi", materials: [materials[1]._id], creator: "seed" },
    { name: "Ölçüm", description: "Tolerans ölçümü", creator: "seed" },
    { name: "Bakım", description: "Temizlik ve bakım", materials: [materials[2]._id], creator: "seed" },
    { name: "Balata değişimi", materials: [materials[0]._id], creator: "seed" },
    { name: "Montaj", creator: "seed" },
    { name: "Test", creator: "seed" },
  ]);

  const stages = await Stage.create([
    {
      name: "İkmal",
      description: "Hazırlık ve ikmal",
      plannedOrder: 1,
      subStages: [subStages[0]._id, subStages[1]._id],
      creator: "seed",
    },
    {
      name: "Boji Bakımı",
      description: "Boji sökümü ve bakımı",
      plannedOrder: 2,
      subStages: [subStages[2]._id, subStages[3]._id],
      materials: [materials[0]._id],
      creator: "seed",
    },
    {
      name: "Depoya Giriş",
      description: "Montaj ve teslim",
      plannedOrder: 3,
      subStages: [subStages[4]._id, subStages[5]._id],
      creator: "seed",
    },
  ]);

  const workflows = await Workflow.create([
    {
      name: "Genel Revizyon",
      description: "Uçtan uca revizyon akışı",
      stages: stages.map((stage, index) => ({
        stageInfo: stage._id,
        plannedOrder: index + 1,
      })),
      creator: "seed",
    },
    {
      name: "Boji Revizyonu",
      description: "Yalnızca boji bakımı",
      stages: [{ stageInfo: stages[1]._id, plannedOrder: 1 }],
      creator: "seed",
    },
  ]);

  await Reason.create([
    { name: "Malzeme bekleniyor", creator: "seed" },
    { name: "Personel yetersiz", creator: "seed" },
    { name: "Ekipman arızası", creator: "seed" },
  ]);

  /* a planned project ------------------------------------------------------ */

  const project = await Project.create({
    name: "EMU Montaj 2026",
    projectCode: "EMU-26",
    status: "IN_PROGRESS",
    description: "İki vagonlu EMU setlerinin montajı",
    plan: {
      trainType: emuType._id,
      trains: trains.map((train) => train._id),
      wagons: [tcb._id, tcf._id],
      items: [
        { workflow: workflows[0]._id, scope: "WAGON" },
        { workflow: workflows[1]._id, scope: "TRAIN" },
      ],
      // TR3's TCF is exempt from the general overhaul, so the totals can be
      // seen to drop for one pair only.
      exclusions: { [`${trains[2]._id}:${tcf._id}`]: [String(workflows[0]._id)] },
      materials: materials.map((material) => material._id),
    },
    creator: admin.fullname,
  });

  /* one process, partly done ---------------------------------------------- */

  const overhaul = await Workflow.findById(workflows[0]._id).populate("stages.stageInfo");
  const stageDocs = await Stage.find({
    _id: { $in: overhaul.stages.map((entry) => entry.stageInfo._id) },
  }).populate("subStages");
  const byId = new Map(stageDocs.map((stage) => [String(stage._id), stage]));

  const entries = overhaul.stages.map((entry, index) => {
    const stage = byId.get(String(entry.stageInfo._id));
    return {
      stageId: stage._id,
      stageName: stage.name,
      plannedOrder: index + 1,
      operator: index === 1 ? "Ali Operatör" : "",
      startedAt: index <= 1 ? new Date(Date.now() - (3 - index) * 86400000) : null,
      endedAt: index === 0 ? new Date(Date.now() - 2 * 86400000) : null,
      subStages: (stage.subStages ?? []).map((subStage, subIndex) => ({
        subStageId: subStage._id,
        name: subStage.name,
        // First stage finished; the second has one sub-stage done, one running.
        status: index === 0 ? 2 : index === 1 && subIndex === 0 ? 2 : 0,
        start: index <= 1 ? new Date(Date.now() - 86400000) : null,
        end: index === 0 || (index === 1 && subIndex === 0) ? new Date() : null,
        materials: subStage.materials ?? [],
      })),
    };
  });

  await Process.create({
    project: project._id,
    train: trains[0]._id,
    wagon: tcb._id,
    workflow: workflows[0]._id,
    description: "İlk setin TCB vagonu",
    status: "ACTIVE",
    startedAt: new Date(Date.now() - 3 * 86400000),
    creator: admin.fullname,
    entries,
  });

  console.log(`
[seed] done.
  login : admin@tms.local / Admin123!
  also  : operator@tms.local / Operator123!
  data  : 1 train type, 3 trains, 2 wagons, 3 stages, 6 sub-stages,
          2 workflows, 3 materials, 3 delay reasons, 1 planned project,
          1 process in progress
`);

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error("[seed] failed", err);
  process.exit(1);
});
