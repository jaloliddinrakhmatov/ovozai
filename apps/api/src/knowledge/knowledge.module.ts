import { Module } from "@nestjs/common";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";
import { IngestionQueue } from "./ingestion.queue";
import { embeddingProvider } from "./embedding.provider";

@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeService, IngestionQueue, embeddingProvider],
})
export class KnowledgeModule {}
