CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  provider TEXT,
  token TEXT,
  phone_number_id TEXT
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  from_number TEXT,
  to_number TEXT,
  text TEXT,
  direction TEXT,
  ts INTEGER
);
