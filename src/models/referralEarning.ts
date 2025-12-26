import { Document, Schema, model } from "mongoose";

export type ReferralEarningSource = "signup" | "purchase";

export interface IReferralEarning extends Document {
  referrerEmail: string;
  referredEmail: string;
  credits: number;
  source: ReferralEarningSource;
  purchaseCredits?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralEarningSchema = new Schema<IReferralEarning>(
  {
    referrerEmail: { type: String, required: true, lowercase: true, trim: true },
    referredEmail: { type: String, required: true, lowercase: true, trim: true },
    credits: { type: Number, required: true },
    source: { type: String, enum: ["signup", "purchase"], required: true },
    purchaseCredits: { type: Number },
  },
  { timestamps: true }
);

ReferralEarningSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const ReferralEarning = model<IReferralEarning>(
  "ReferralEarning",
  ReferralEarningSchema
);
