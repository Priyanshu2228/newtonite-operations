-- CreateTable
CREATE TABLE "TeamUpdate" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamUpdate_teamId_createdAt_idx" ON "TeamUpdate"("teamId", "createdAt");

-- AddForeignKey
ALTER TABLE "TeamUpdate" ADD CONSTRAINT "TeamUpdate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamUpdate" ADD CONSTRAINT "TeamUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
