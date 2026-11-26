import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type GameId = 'plane-shooter' | 'match-pairs' | 'word-scramble';

export interface IGameScore extends Document {
  userId: Types.ObjectId;
  displayName: string;
  game: GameId;
  subMode: string;
  score: number;
  wordsCleared: number;
  maxCombo: number;
  wave: number;
  durationSec: number;
  createdAt: Date;
}

const GameScoreSchema = new Schema<IGameScore>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    displayName: { type: String, required: true, trim: true, maxlength: 48 },
    game: {
      type: String,
      enum: ['plane-shooter', 'match-pairs', 'word-scramble'],
      default: 'plane-shooter',
      index: true,
    },
    subMode: { type: String, default: 'default', maxlength: 24 },
    score: { type: Number, required: true, min: 0, max: 1_000_000 },
    wordsCleared: { type: Number, required: true, min: 0, max: 10_000 },
    maxCombo: { type: Number, default: 0, min: 0, max: 10_000 },
    wave: { type: Number, default: 1, min: 1, max: 999 },
    durationSec: { type: Number, default: 0, min: 0, max: 86_400 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

GameScoreSchema.index({ game: 1, score: -1, createdAt: -1 });
GameScoreSchema.index({ userId: 1, game: 1, score: -1 });

export const GameScore: Model<IGameScore> =
  (mongoose.models.GameScore as Model<IGameScore>) ||
  mongoose.model<IGameScore>('GameScore', GameScoreSchema);
