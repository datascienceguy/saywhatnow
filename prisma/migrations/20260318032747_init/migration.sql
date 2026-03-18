-- CreateTable
CREATE TABLE "Show" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "showId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "airDate" DATETIME,
    "productionCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    CONSTRAINT "Episode_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "episodeId" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "duration" INTEGER,
    "startTime" TEXT NOT NULL,
    "stopTime" TEXT NOT NULL,
    "keywords" TEXT,
    CONSTRAINT "Clip_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Speaker" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "showId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RECURRING',
    CONSTRAINT "Speaker_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "episodeId" INTEGER NOT NULL,
    "clipId" INTEGER NOT NULL,
    "speakerId" INTEGER,
    "text" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    CONSTRAINT "Quote_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quote_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quote_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClipSpeaker" (
    "clipId" INTEGER NOT NULL,
    "speakerId" INTEGER NOT NULL,
    "lineCount" INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY ("clipId", "speakerId"),
    CONSTRAINT "ClipSpeaker_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClipSpeaker_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'GUEST',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Show_name_key" ON "Show"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_productionCode_key" ON "Episode"("productionCode");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_showId_season_episodeNumber_key" ON "Episode"("showId", "season", "episodeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Speaker_showId_name_key" ON "Speaker"("showId", "name");

-- CreateIndex
CREATE INDEX "Quote_clipId_sequence_idx" ON "Quote"("clipId", "sequence");

-- CreateIndex
CREATE INDEX "Quote_speakerId_idx" ON "Quote"("speakerId");

-- CreateIndex
CREATE INDEX "Quote_episodeId_idx" ON "Quote"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
