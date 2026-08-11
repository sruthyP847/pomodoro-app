-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeGamePlanId" TEXT;

-- CreateTable
CREATE TABLE "GamePlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workDurationMs" INTEGER NOT NULL,
    "breakDurationMs" INTEGER NOT NULL,
    "longBreakDurationMs" INTEGER NOT NULL,
    "sessionsBeforeLongBreak" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlan_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeGamePlanId_fkey" FOREIGN KEY ("activeGamePlanId") REFERENCES "GamePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlan" ADD CONSTRAINT "GamePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
