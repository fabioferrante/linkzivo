-- CreateTable
CREATE TABLE "QrScanLock" (
    "id" TEXT NOT NULL,
    "smartLinkId" TEXT NOT NULL,
    "clickId" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrScanLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QrScanLock_smartLinkId_idx" ON "QrScanLock"("smartLinkId");

-- CreateIndex
CREATE INDEX "QrScanLock_lockedUntil_idx" ON "QrScanLock"("lockedUntil");

-- AddForeignKey
ALTER TABLE "QrScanLock" ADD CONSTRAINT "QrScanLock_smartLinkId_fkey" FOREIGN KEY ("smartLinkId") REFERENCES "SmartLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
