import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  createPhoneNumberRequestSchema,
  phoneNumberListQuerySchema,
  updatePhoneNumberRequestSchema,
  type CreatePhoneNumberRequest,
  type PhoneNumberDto,
  type PhoneNumberListQuery,
  type UpdatePhoneNumberRequest,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { requestContextFrom } from "../common/request-context";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { PhoneNumbersService } from "./phone-numbers.service";

@Controller("phone-numbers")
export class PhoneNumbersController {
  constructor(private readonly phoneNumbers: PhoneNumbersService) {}

  @Get()
  @Roles("VIEWER")
  list(@Query(new ZodValidationPipe(phoneNumberListQuerySchema)) query: PhoneNumberListQuery) {
    return this.phoneNumbers.list(query);
  }

  @Post()
  @Roles("ADMIN")
  create(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(createPhoneNumberRequestSchema)) body: CreatePhoneNumberRequest,
    @Req() req: RequestWithContext,
  ): Promise<PhoneNumberDto> {
    return this.phoneNumbers.create(principal, principal.organizationId as string, body, requestContextFrom(req));
  }

  @Patch(":id")
  @Roles("ADMIN")
  update(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePhoneNumberRequestSchema)) body: UpdatePhoneNumberRequest,
    @Req() req: RequestWithContext,
  ): Promise<PhoneNumberDto> {
    return this.phoneNumbers.update(principal, principal.organizationId as string, id, body, requestContextFrom(req));
  }

  @Delete(":id")
  @Roles("ADMIN")
  @HttpCode(204)
  release(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.phoneNumbers.release(principal, principal.organizationId as string, id, requestContextFrom(req));
  }
}
