// src/models/License.ts
import { Schema, model, Document } from "mongoose";

export type LicensePlan = "trial" | "pro" | "lifetime";

export interface ILicense extends Document {
  key: string;
  plan: LicensePlan;
  active: boolean;

  maxRunsPerMonth: number;   // -1 = unlimited
  usedRunsThisPeriod: number;
  periodStart: Date;         // usually first day of month

  createdAt: Date;
  updatedAt: Date;
}

const LicenseSchema = new Schema<ILicense>(
  {
    key: { type: String, unique: true, required: true },
    plan: { type: String, enum: ["trial", "pro", "lifetime"], default: "trial" },
    active: { type: Boolean, default: true },

    maxRunsPerMonth: { type: Number, default: 3 }, // e.g. trial: 3 runs per month
    usedRunsThisPeriod: { type: Number, default: 0 },
    periodStart: { type: Date, default: () => firstDayOfCurrentMonth() }
  },
  { timestamps: true }
);

function firstDayOfCurrentMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

LicenseSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const License = model<ILicense>("License", LicenseSchema);
export { firstDayOfCurrentMonth };

