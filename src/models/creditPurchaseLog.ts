import { Document, Schema, model } from "mongoose";

export interface ICreditPurchaseLog extends Document {
  email: string;
  credits: number;
  priceId?: string;
  eventId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CreditPurchaseLogSchema = new Schema<ICreditPurchaseLog>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    credits: { type: Number, required: true },
    priceId: { type: String },
    eventId: { type: String },
  },
  { timestamps: true }
);

CreditPurchaseLogSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const CreditPurchaseLog = model<ICreditPurchaseLog>(
  "CreditPurchaseLog",
  CreditPurchaseLogSchema
);
