import { Document, Schema, model } from "mongoose";

export interface ISupportRequest extends Document {
  email: string;
  subject: string;
  message: string;
  attachLogs?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SupportSchema = new Schema<ISupportRequest>(
  {
    email: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    attachLogs: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SupportSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const SupportRequest = model<ISupportRequest>("SupportRequest", SupportSchema);
