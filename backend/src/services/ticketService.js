const mongoose = require('mongoose');
const Chat = require('../models/Chat');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    const date = new Date(parsed.date);
    if (!mongoose.isValidObjectId(parsed.id) || Number.isNaN(date.getTime())) return null;
    return { date, id: new mongoose.Types.ObjectId(parsed.id) };
  } catch {
    return null;
  }
}

function encodeCursor(chat) {
  const date = chat.updatedAt || new Date(0);
  return Buffer.from(JSON.stringify({ date, id: chat._id })).toString('base64url');
}

async function listTickets({ status, cursor, limit }) {
  const pageSize = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit || DEFAULT_LIMIT, 10)));
  const filter = status ? { status } : {};
  const decoded = decodeCursor(cursor);
  if (cursor && !decoded) {
    const error = new Error('Cursor de paginacao invalido.');
    error.statusCode = 400;
    throw error;
  }
  if (decoded) {
    filter.$or = [
      { updatedAt: { $lt: decoded.date } },
      { updatedAt: decoded.date, _id: { $lt: decoded.id } },
    ];
  }
  const rows = await Chat.find(filter)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(pageSize + 1)
    .lean();
  const hasMore = rows.length > pageSize;
  const data = rows.slice(0, pageSize);
  return {
    data,
    meta: {
      limit: pageSize,
      hasMore,
      nextCursor: hasMore ? encodeCursor(data[data.length - 1]) : null,
    },
  };
}

module.exports = { listTickets, decodeCursor, encodeCursor };
