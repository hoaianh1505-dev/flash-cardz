import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDailyStats {
  streak: number;
  lastDate: string;
  todayCount: number;
}

export interface IUser extends Document {
  username: string;
  usernameLower: string;
  displayName: string;
  passwordHash: string;
  daily: IDailyStats;
  dailyGoal: number;
  createdAt: Date;
  updatedAt: Date;
}

const DailyStatsSchema = new Schema<IDailyStats>(
  {
    streak: { type: Number, default: 0 },
    lastDate: { type: String, default: '' },
    todayCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, trim: true },
    usernameLower: { type: String, required: true, unique: true, lowercase: true, index: true },
    displayName: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true },
    daily: { type: DailyStatsSchema, default: () => ({ streak: 0, lastDate: '', todayCount: 0 }) },
    dailyGoal: { type: Number, default: 20, min: 5, max: 200 },
  },
  { timestamps: true }
);

export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>('User', UserSchema);
