const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { ValidationError, ConflictError, UnauthorizedError, NotFoundError } = require('../errors');

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = '8h';

if (!process.env.JWT_SECRET) {
  console.warn(
    'WARNING: JWT_SECRET is not set — using an insecure default signing key. ' +
      'Set JWT_SECRET before running this anywhere but a local sandbox.'
  );
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';

const getUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const getUserByPhone = db.prepare('SELECT * FROM users WHERE phone = ?');
const insertUser = db.prepare(
  'INSERT INTO users (username, password_hash, name, phone) VALUES (?, ?, ?, ?)'
);
const updateUserPassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');

function registerUser(username, password, name, phone) {
  if (!username || typeof username !== 'string') throw new ValidationError('username is required');
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new ValidationError('password is required and must be at least 8 characters');
  }
  if (!name || typeof name !== 'string') throw new ValidationError('name is required');
  if (!phone || typeof phone !== 'string') throw new ValidationError('phone is required');
  if (getUserByUsername.get(username)) throw new ConflictError(`User "${username}" already exists`);
  // Phone must be unique too — it's how resetPassword looks an account up.
  if (getUserByPhone.get(phone)) throw new ConflictError(`An account with phone ${phone} already exists`);

  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const info = insertUser.run(username, passwordHash, name, phone);
  return { id: info.lastInsertRowid, username, name, phone };
}

function loginUser(username, password) {
  if (!username || !password) throw new ValidationError('username and password are required');

  const user = getUserByUsername.get(username);
  // Same error whether the user doesn't exist or the password is wrong —
  // don't give an attacker a way to enumerate valid usernames.
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw new UnauthorizedError('Invalid username or password');
  }

  const token = jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
  return { token };
}

// Direct reset by phone — no verification step (no email/SMS service in
// this project). Deliberately simple: anyone who knows the phone number on
// an account can reset its password. Fine for a local/internal tool, not
// something to expose on a real production deployment without adding a
// verification step first.
function resetPassword(phone, newPassword) {
  if (!phone || typeof phone !== 'string') throw new ValidationError('phone is required');
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new ValidationError('newPassword is required and must be at least 8 characters');
  }

  const user = getUserByPhone.get(phone);
  if (!user) throw new NotFoundError(`No staff account with phone ${phone}`);

  const passwordHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  updateUserPassword.run(passwordHash, user.id);
  return { username: user.username };
}

// Express middleware: requires "Authorization: Bearer <token>", verifies it,
// and attaches the decoded payload as req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

module.exports = { registerUser, loginUser, resetPassword, requireAuth };
