import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { getAuthenticatedUser } from "../../../utils/request.js";
import type {
  InviteMemberRequest,
  InviteMemberResponse,
  MemberListResponse,
  MemberResponse,
  UpdateMemberRoleRequest,
} from "../dto/business.dto.js";
import { memberService } from "../member.service.js";

@Route("businesses/{businessId}/members")
@Tags("Team")
export class MemberController extends Controller {
  /** Lists team members and pending invitations. */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Team retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listMembers(@Path() businessId: string): Promise<MemberListResponse> {
    return memberService.listMembers(businessId);
  }

  /**
   * Adds an existing user to the team, or records an invitation that is
   * accepted automatically when that email signs up.
   */
  @Post()
  @Security("jwt", ["business:manage"])
  @SuccessResponse("201", "Member added or invited")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(409, "Already a member")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async inviteMember(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Body() body: InviteMemberRequest,
  ): Promise<InviteMemberResponse> {
    this.setStatus(201);
    return memberService.inviteMember(
      businessId,
      getAuthenticatedUser(request).id,
      body,
    );
  }

  /** Changes a member's role. The owner's role cannot be changed. */
  @Patch("{membershipId}")
  @Security("jwt", ["business:owner"])
  @SuccessResponse("200", "Role updated")
  @Response<ApiErrorResponse>(403, "Only the owner can change roles")
  @Response<ApiErrorResponse>(404, "Member was not found")
  @Response<ApiErrorResponse>(409, "The owner cannot be changed")
  public updateMemberRole(
    @Path() businessId: string,
    @Path() membershipId: string,
    @Body() body: UpdateMemberRoleRequest,
  ): Promise<MemberResponse> {
    return memberService.updateMemberRole(businessId, membershipId, body);
  }

  /** Removes a member. The owner cannot be removed. */
  @Delete("{membershipId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("204", "Member removed")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(404, "Member was not found")
  @Response<ApiErrorResponse>(409, "The owner cannot be removed")
  public async removeMember(
    @Path() businessId: string,
    @Path() membershipId: string,
  ): Promise<void> {
    await memberService.removeMember(businessId, membershipId);
    this.setStatus(204);
  }

  /** Revokes a pending invitation. */
  @Delete("invitations/{invitationId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("204", "Invitation revoked")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(404, "Invitation was not found")
  public async revokeInvitation(
    @Path() businessId: string,
    @Path() invitationId: string,
  ): Promise<void> {
    await memberService.revokeInvitation(businessId, invitationId);
    this.setStatus(204);
  }
}
