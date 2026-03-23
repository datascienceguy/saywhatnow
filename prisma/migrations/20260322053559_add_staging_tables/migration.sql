-- CreateTable
CREATE TABLE "StagingEpisode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "showId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "airDate" DATETIME,
    "productionCode" TEXT,
    "basename" TEXT NOT NULL,
    "videoPath" TEXT NOT NULL,
    "quotesPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StagingEpisode_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StagingClip" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stagingEpisodeId" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "startTime" REAL NOT NULL,
    "endTime" REAL NOT NULL,
    CONSTRAINT "StagingClip_stagingEpisodeId_fkey" FOREIGN KEY ("stagingEpisodeId") REFERENCES "StagingEpisode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StagingQuote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stagingEpisodeId" INTEGER NOT NULL,
    "stagingClipId" INTEGER,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startTime" REAL,
    "endTime" REAL,
    "matchMethod" TEXT,
    "sequence" INTEGER NOT NULL,
    CONSTRAINT "StagingQuote_stagingEpisodeId_fkey" FOREIGN KEY ("stagingEpisodeId") REFERENCES "StagingEpisode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StagingQuote_stagingClipId_fkey" FOREIGN KEY ("stagingClipId") REFERENCES "StagingClip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StagingEpisode_basename_key" ON "StagingEpisode"("basename");
