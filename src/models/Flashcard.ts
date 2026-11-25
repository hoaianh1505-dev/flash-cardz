import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IMeaning {
  text: string;
  type?: string;
  phonetic?: string;
}

export interface IFlashcard extends Document {
  userId: Types.ObjectId;
  word: string;
  wordLower: string;
  meanings: IMeaning[];
  learned: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const MeaningSchema = new Schema<IMeaning>(
  {
    text: { type: String, required: true, trim: true },
    type: { type: String, default: '' },
    phonetic: { type: String, default: '' },
  },
  { _id: false }
);

const FlashcardSchema = new Schema<IFlashcard>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    word: { type: String, required: true, trim: true },
    wordLower: { type: String, required: true, lowercase: true },
    meanings: { type: [MeaningSchema], required: true },
    learned: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

FlashcardSchema.index({ userId: 1, wordLower: 1 });
FlashcardSchema.index({ userId: 1, sortOrder: 1 });

export const Flashcard: Model<IFlashcard> =
  (mongoose.models.Flashcard as Model<IFlashcard>) ||
  mongoose.model<IFlashcard>('Flashcard', FlashcardSchema);
