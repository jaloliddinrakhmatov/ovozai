import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  appointmentListQuerySchema,
  createAppointmentRequestSchema,
  updateAppointmentRequestSchema,
  type AppointmentDto,
  type AppointmentListQuery,
  type CreateAppointmentRequest,
  type UpdateAppointmentRequest,
} from "@ovozai/contracts";
import { CurrentPrincipal } from "../common/current-principal.decorator";
import { Roles } from "../common/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { requestContextFrom } from "../common/request-context";
import type { RequestWithContext, UserPrincipal } from "../common/principal.types";
import { AppointmentsService } from "./appointments.service";

@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @Roles("VIEWER")
  list(@Query(new ZodValidationPipe(appointmentListQuerySchema)) query: AppointmentListQuery) {
    return this.appointments.list(query);
  }

  @Post()
  @Roles("MEMBER")
  create(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body(new ZodValidationPipe(createAppointmentRequestSchema)) body: CreateAppointmentRequest,
    @Req() req: RequestWithContext,
  ): Promise<AppointmentDto> {
    return this.appointments.create(principal, principal.organizationId as string, body, requestContextFrom(req));
  }

  @Get(":id")
  @Roles("VIEWER")
  get(@Param("id") id: string): Promise<AppointmentDto> {
    return this.appointments.get(id);
  }

  @Patch(":id")
  @Roles("MEMBER")
  update(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAppointmentRequestSchema)) body: UpdateAppointmentRequest,
    @Req() req: RequestWithContext,
  ): Promise<AppointmentDto> {
    return this.appointments.update(principal, principal.organizationId as string, id, body, requestContextFrom(req));
  }

  @Delete(":id")
  @Roles("MEMBER")
  @HttpCode(204)
  remove(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Req() req: RequestWithContext,
  ): Promise<void> {
    return this.appointments.remove(principal, principal.organizationId as string, id, requestContextFrom(req));
  }
}
