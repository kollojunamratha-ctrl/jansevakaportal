const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const User = require("../models/user");
const { connectMongo } = require("./mongo");

const USERS_FILE = path.join(__dirname, "..", "..", "data", "users.json");

function requiresPersistentStore() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function createMissingMongoError() {
  return new Error("MONGO_URI must be configured for user data on production deployments.");
}

async function ensureUsersFile() {
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
    await fs.writeFile(USERS_FILE, JSON.stringify({ users: [] }, null, 2), "utf8");
  }
}

async function readUsers() {
  await ensureUsersFile();
  const raw = await fs.readFile(USERS_FILE, "utf8");
  const payload = JSON.parse(raw);
  return Array.isArray(payload.users) ? payload.users : [];
}

async function writeUsers(users) {
  await ensureUsersFile();
  await fs.writeFile(USERS_FILE, JSON.stringify({ users }, null, 2), "utf8");
}

async function useMongo() {
  try {
    return await connectMongo();
  } catch (error) {
    if (requiresPersistentStore()) {
      throw error;
    }

    return false;
  }
}

async function shouldUseJsonUsers() {
  const mongoAvailable = await useMongo();

  if (mongoAvailable) {
    return false;
  }

  if (requiresPersistentStore()) {
    throw createMissingMongoError();
  }

  return true;
}

function buildJsonUserRecord(record) {
  return {
    _id: record.id,
    id: record.id,
    phone: record.phone,
    password: record.password,
    name: record.name || "",
    age: record.age ?? null,
    state: record.state || "",
    address: record.address || "",
    aadhar: record.aadhar || "",
    schemesApplied: record.schemesApplied ?? 0,
    createdAt: record.createdAt
  };
}

async function findUserById(id) {
  if (!(await shouldUseJsonUsers())) {
    return User.findById(id);
  }

  const users = await readUsers();
  const match = users.find((user) => user.id === id);
  return match ? buildJsonUserRecord(match) : null;
}

async function findUserByPhone(phone) {
  if (!(await shouldUseJsonUsers())) {
    return User.findOne({ phone });
  }

  const users = await readUsers();
  const match = users.find((user) => user.phone === phone);
  return match ? buildJsonUserRecord(match) : null;
}

async function createUser({ phone, password }) {
  if (!(await shouldUseJsonUsers())) {
    return User.create({ phone, password });
  }

  const users = await readUsers();

  if (users.some((user) => user.phone === phone)) {
    const error = new Error("An account with this phone number already exists.");
    error.code = "DUPLICATE_PHONE";
    throw error;
  }

  const record = {
    id: crypto.randomUUID(),
    phone,
    password,
    name: "",
    age: null,
    state: "",
    address: "",
    aadhar: "",
    schemesApplied: 0,
    createdAt: new Date().toISOString()
  };

  users.push(record);
  await writeUsers(users);
  return buildJsonUserRecord(record);
}

async function updateUserPassword(phone, password) {
  if (!(await shouldUseJsonUsers())) {
    const user = await User.findOne({ phone });

    if (!user) {
      return null;
    }

    user.password = password;
    await user.save();
    return user;
  }

  const users = await readUsers();
  const index = users.findIndex((user) => user.phone === phone);

  if (index === -1) {
    return null;
  }

  users[index].password = password;
  await writeUsers(users);
  return buildJsonUserRecord(users[index]);
}

async function updateUserProfile(id, updates) {
  const sanitizedUpdates = {};

  if (Object.prototype.hasOwnProperty.call(updates, "phone")) {
    sanitizedUpdates.phone = updates.phone;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    sanitizedUpdates.name = updates.name ?? "";
  }

  if (Object.prototype.hasOwnProperty.call(updates, "age")) {
    sanitizedUpdates.age = updates.age ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "state")) {
    sanitizedUpdates.state = updates.state ?? "";
  }

  if (Object.prototype.hasOwnProperty.call(updates, "address")) {
    sanitizedUpdates.address = updates.address ?? "";
  }

  if (Object.prototype.hasOwnProperty.call(updates, "aadhar")) {
    sanitizedUpdates.aadhar = updates.aadhar ?? "";
  }

  if (Object.prototype.hasOwnProperty.call(updates, "schemesApplied")) {
    sanitizedUpdates.schemesApplied = updates.schemesApplied ?? 0;
  }

  if (!(await shouldUseJsonUsers())) {
    const user = await User.findById(id);

    if (!user) {
      return null;
    }

    if (sanitizedUpdates.phone && sanitizedUpdates.phone !== user.phone) {
      const existingUser = await User.findOne({ phone: sanitizedUpdates.phone });

      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        const error = new Error("An account with this phone number already exists.");
        error.code = "DUPLICATE_PHONE";
        throw error;
      }
    }

    Object.assign(user, sanitizedUpdates);
    await user.save();
    return user;
  }

  const users = await readUsers();
  const index = users.findIndex((user) => user.id === id);

  if (index === -1) {
    return null;
  }

  if (
    sanitizedUpdates.phone &&
    users.some((user) => user.id !== id && user.phone === sanitizedUpdates.phone)
  ) {
    const error = new Error("An account with this phone number already exists.");
    error.code = "DUPLICATE_PHONE";
    throw error;
  }

  users[index] = {
    ...users[index],
    ...sanitizedUpdates
  };
  await writeUsers(users);
  return buildJsonUserRecord(users[index]);
}

module.exports = {
  createUser,
  findUserById,
  findUserByPhone,
  updateUserProfile,
  updateUserPassword
};
