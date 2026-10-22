-- Link an appointment to the call during which the AI booked it (audit trail).
-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "call_id" TEXT;

-- CreateIndex
CREATE INDEX "appointments_call_id_idx" ON "appointments"("call_id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
