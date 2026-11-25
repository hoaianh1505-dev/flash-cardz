import fs from 'fs';
import path from 'path';
import dns from 'dns';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../src/models/User';
import { Flashcard } from '../src/models/Flashcard';

// Use public DNS resolvers if local Windows DNS refuses SRV lookups
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Load .env.local manually so `npm run seed` works cleanly standalone
function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

interface SeedCard {
  cardOrder: number;
  word: string;
  meanings: { text: string; type?: string; phonetic?: string }[];
  learned: boolean;
}

async function main() {
  loadEnvFile();

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env.local or environment');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB!');

  const username = 'anhpro';
  const displayName = 'AnhPro';
  const password = process.env.SEED_PASSWORD || 'anhpro123';
  const usernameLower = username.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  let user = await User.findOne({ usernameLower });
  if (!user) {
    user = await User.create({
      username,
      usernameLower,
      displayName,
      passwordHash,
      daily: { streak: 1, lastDate: '', todayCount: 0 },
    });
    console.log(`Created user "${username}" (displayName: "${displayName}", password: ${password})`);
  } else {
    user.username = username;
    user.displayName = displayName;
    user.passwordHash = passwordHash;
    await user.save();
    console.log(`Updated user "${username}" (displayName: "${displayName}", password: ${password})`);
  }

  const seedPath = path.resolve(process.cwd(), 'src/data/anhpro-seed.json');
  const raw: SeedCard[] = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const existingCount = await Flashcard.countDocuments({ userId: user._id });
  const force = process.argv.includes('--force');

  if (existingCount > 0 && !force) {
    console.log(
      `User "${username}" already has ${existingCount} cards. Skipping card seed (pass --force to re-seed).`
    );
  } else {
    if (existingCount > 0) {
      await Flashcard.deleteMany({ userId: user._id });
      console.log(`Cleared ${existingCount} existing cards for "${username}".`);
    }

    const docs = raw.map((c, idx) => ({
      userId: user._id,
      word: c.word,
      wordLower: c.word.toLowerCase(),
      meanings: c.meanings.map((m) => ({
        text: m.text,
        type: m.type || '',
        phonetic: m.phonetic || '',
      })),
      learned: !!c.learned,
      sortOrder: c.cardOrder || idx + 1,
    }));

    // Insert in batches of 500 for speed & stability
    const batchSize = 500;
    for (let i = 0; i < docs.length; i += batchSize) {
      await Flashcard.insertMany(docs.slice(i, i + batchSize), { ordered: true });
    }

    const learnedCount = docs.filter((d) => d.learned).length;
    console.log(
      `Seeded ${docs.length} cards for "${username}" (${learnedCount} learned, ${docs.length - learnedCount} unlearned).`
    );
  }

  await mongoose.disconnect();
  console.log('Seed complete!');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
