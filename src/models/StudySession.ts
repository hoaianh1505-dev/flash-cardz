import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IStudySession extends Document {
  userId: Types.ObjectId;
  mode: 'dictation' | 'quiz' | 'speaking';
  score: number;
  total: number;
  accuracy: number;
  durationSec: number;
  missedWords: string[];
  createdAt: Date;
}

const StudySessionSchema = new Schema<IStudySession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mode: { type: String, enum: ['dictation', 'quiz', 'speaking'], required: true },
    score: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 1 },
    accuracy: { type: Number, required: true, min: 0, max: 100 },
    durationSec: { type: Number, default: 0, min: 0 },
    missedWords: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

StudySessionSchema.index({ userId: 1, createdAt: -1 });

export const StudySession: Model<IStudySession> =
  (mongoose.models.StudySession as Model<IStudySession>) ||
  mongoose.model<IStudySession>('StudySession', StudySessionSchema);
