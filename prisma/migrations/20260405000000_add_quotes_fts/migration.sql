-- FTS5 virtual table for full-text search on quote text
CREATE VIRTUAL TABLE IF NOT EXISTS quotes_fts USING fts5(
  text,
  content="Quote",
  content_rowid="id"
);

-- Populate from existing quotes
INSERT INTO quotes_fts(rowid, text) SELECT id, text FROM "Quote";

-- Keep in sync with Quote table
CREATE TRIGGER quotes_fts_ai AFTER INSERT ON "Quote" BEGIN
  INSERT INTO quotes_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER quotes_fts_ad AFTER DELETE ON "Quote" BEGIN
  INSERT INTO quotes_fts(quotes_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;

CREATE TRIGGER quotes_fts_au AFTER UPDATE ON "Quote" BEGIN
  INSERT INTO quotes_fts(quotes_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO quotes_fts(rowid, text) VALUES (new.id, new.text);
END;
