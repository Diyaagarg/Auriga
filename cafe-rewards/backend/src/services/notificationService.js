const db = require('../db');

const insertNotification = db.prepare('INSERT INTO notifications (phone, message) VALUES (?, ?)');
// Secondary `id DESC` keeps ordering deterministic for notifications created
// within the same second (created_at has only second-level resolution).
const selectAllNotifications = db.prepare(
  'SELECT id, phone, message, created_at FROM notifications ORDER BY created_at DESC, id DESC'
);

function notifyTierUpgrade(phone, tierName) {
  const message = `Congrats! You've been upgraded to ${tierName} tier.`;
  const info = insertNotification.run(phone, message);
  return { id: info.lastInsertRowid, phone, message };
}

function toApiNotification(row) {
  return { id: row.id, phone: row.phone, message: row.message, timestamp: row.created_at };
}

function listNotifications() {
  return selectAllNotifications.all().map(toApiNotification);
}

module.exports = { notifyTierUpgrade, listNotifications };
