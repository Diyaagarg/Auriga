const db = require('../db');
const { ValidationError } = require('../errors');

const getClockRow = db.prepare('SELECT simulated_time FROM clock WHERE id = 1');
// SQLite's datetime() modifier syntax ("+N days") is built from the bound
// parameter here — SQLite evaluates it at run time same as a literal string.
const advanceClockStmt = db.prepare(
  "UPDATE clock SET simulated_time = datetime(simulated_time, '+' || ? || ' days') WHERE id = 1"
);

function getCurrentTime() {
  return getClockRow.get().simulated_time;
}

function advanceClock(days) {
  if (!Number.isInteger(days) || days <= 0) {
    throw new ValidationError('advanceDays must be a positive integer');
  }
  advanceClockStmt.run(days);
  return getCurrentTime();
}

module.exports = { getCurrentTime, advanceClock };
