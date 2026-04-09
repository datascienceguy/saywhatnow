-- Make StagingClip startTime and endTime nullable
-- SQLite doesn't support ALTER COLUMN, so we recreate the table

PRAGMA foreign_keys=off;

CREATE TABLE "StagingClip_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stagingEpisodeId" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "startTime" REAL,
    "endTime" REAL,
    CONSTRAINT "StagingClip_stagingEpisodeId_fkey" FOREIGN KEY ("stagingEpisodeId") REFERENCES "StagingEpisode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "StagingClip_new" SELECT * FROM "StagingClip";

DROP TABLE "StagingClip";

ALTER TABLE "StagingClip_new" RENAME TO "StagingClip";

PRAGMA foreign_keys=on;
