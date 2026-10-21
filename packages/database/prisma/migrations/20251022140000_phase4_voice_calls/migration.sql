-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('QUEUED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY', 'CANCELED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "TranscriptRole" AS ENUM ('CALLER', 'AGENT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('CALL_MINUTES', 'STT_SECONDS', 'TTS_CHARS', 'LLM_TOKENS');

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "customer_id" TEXT,
    "direction" "CallDirection" NOT NULL DEFAULT 'INBOUND',
    "status" "CallStatus" NOT NULL DEFAULT 'QUEUED',
    "from_e164" TEXT,
    "to_e164" TEXT,
    "language" "Language" NOT NULL DEFAULT 'UZ',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "ended_reason" TEXT,
    "recording_object_key" TEXT,
    "cost_cents" INTEGER,
    "external_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_events" (
    "id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'UZ',
    "full_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_turns" (
    "id" TEXT NOT NULL,
    "transcript_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" "TranscriptRole" NOT NULL,
    "text" TEXT NOT NULL,
    "start_ms" INTEGER NOT NULL,
    "end_ms" INTEGER,
    "confidence" DOUBLE PRECISION,
    "language" "Language",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "call_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calls_organization_id_idx" ON "calls"("organization_id");

-- CreateIndex
CREATE INDEX "calls_organization_id_status_started_at_idx" ON "calls"("organization_id", "status", "started_at");

-- CreateIndex
CREATE INDEX "call_events_call_id_occurred_at_idx" ON "call_events"("call_id", "occurred_at");

-- CreateIndex
CREATE INDEX "call_events_organization_id_idx" ON "call_events"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_call_id_key" ON "transcripts"("call_id");

-- CreateIndex
CREATE INDEX "transcripts_organization_id_idx" ON "transcripts"("organization_id");

-- CreateIndex
CREATE INDEX "transcript_turns_transcript_id_idx" ON "transcript_turns"("transcript_id");

-- CreateIndex
CREATE INDEX "transcript_turns_organization_id_idx" ON "transcript_turns"("organization_id");

-- CreateIndex
CREATE INDEX "usage_records_organization_id_idx" ON "usage_records"("organization_id");

-- CreateIndex
CREATE INDEX "usage_records_organization_id_metric_period_key_idx" ON "usage_records"("organization_id", "metric", "period_key");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_turns" ADD CONSTRAINT "transcript_turns_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_turns" ADD CONSTRAINT "transcript_turns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
