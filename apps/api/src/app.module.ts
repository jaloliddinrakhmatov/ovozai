import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { validateEnv } from "./config/env";
import { ProblemDetailsFilter } from "./common/problem-details.filter";
import { TenantInterceptor } from "./tenancy/tenant.interceptor";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { AuditModule } from "./audit/audit.module";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { MembershipsModule } from "./memberships/memberships.module";
import { ApiKeysModule } from "./api-keys/api-keys.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Load the monorepo-root .env first, then any app-local override.
      envFilePath: ["../../.env", ".env"],
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    UsersModule,
    AuthModule,
    OrganizationsModule,
    MembershipsModule,
    ApiKeysModule,
    HealthModule,
  ],
  providers: [
    // RFC 9457 problem+json for every error (preserves the Terminus health body).
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // Bind the authenticated principal's org into the tenant context per request.
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
