-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "workBlockId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeWorkBlockId" TEXT;

-- CreateTable
CREATE TABLE "WorkBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkBlockTask" (
    "id" TEXT NOT NULL,
    "workBlockId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "WorkBlockTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkBlockTask_workBlockId_taskId_key" ON "WorkBlockTask"("workBlockId", "taskId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeWorkBlockId_fkey" FOREIGN KEY ("activeWorkBlockId") REFERENCES "WorkBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_workBlockId_fkey" FOREIGN KEY ("workBlockId") REFERENCES "WorkBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkBlock" ADD CONSTRAINT "WorkBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkBlockTask" ADD CONSTRAINT "WorkBlockTask_workBlockId_fkey" FOREIGN KEY ("workBlockId") REFERENCES "WorkBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkBlockTask" ADD CONSTRAINT "WorkBlockTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
