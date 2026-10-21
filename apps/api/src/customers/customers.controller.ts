import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  createCustomerRequestSchema,
  customerListQuerySchema,
  updateCustomerRequestSchema,
  type CreateCustomerRequest,
  type CustomerDto,
  type CustomerListQuery,
  type UpdateCustomerRequest,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { requestContextFrom } from "../common/request-context";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { CustomersService } from "./customers.service";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Roles("VIEWER")
  list(@Query(new ZodValidationPipe(customerListQuerySchema)) query: CustomerListQuery) {
    return this.customers.list(query);
  }

  @Post()
  @Roles("MEMBER")
  create(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(createCustomerRequestSchema)) body: CreateCustomerRequest,
    @Req() req: RequestWithContext,
  ): Promise<CustomerDto> {
    return this.customers.create(principal, principal.organizationId as string, body, requestContextFrom(req));
  }

  @Get(":id")
  @Roles("VIEWER")
  get(@Param("id") id: string): Promise<CustomerDto> {
    return this.customers.get(id);
  }

  @Patch(":id")
  @Roles("MEMBER")
  update(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomerRequestSchema)) body: UpdateCustomerRequest,
    @Req() req: RequestWithContext,
  ): Promise<CustomerDto> {
    return this.customers.update(principal, principal.organizationId as string, id, body, requestContextFrom(req));
  }

  @Delete(":id")
  @Roles("ADMIN")
  @HttpCode(204)
  remove(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.customers.softDelete(principal, principal.organizationId as string, id, requestContextFrom(req));
  }
}
