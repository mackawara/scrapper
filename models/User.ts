import mongoose, { Document, Model, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  password: string;
  name?: string;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    name: { type: String, trim: true },
    passwordResetToken: { type: String },
    passwordResetExpiry: { type: Date },
  },
  { timestamps: true }
);

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", userSchema);

export default User;
