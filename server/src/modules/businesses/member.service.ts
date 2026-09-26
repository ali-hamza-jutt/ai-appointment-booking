import {
  BUSINESS_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from "../../utils/database.js";
import { assertUuid } from "../../utils/identifiers.js";
import { normalizeEmail } from "../../utils/text.js";
import { memberDal } from "./dal/member.dal.js";
import type {
  InvitationRecord,
  InvitationResponse,
  InviteMemberRequest,
  InviteMemberResponse,
  MemberListResponse,
  MemberRecord,
  MemberResponse,
  UpdateMemberRoleRequest,
} from "./dto/business.dto.js";

const MILLISECONDS_PER_DAY = 86_400_000;

export class MemberService {
  public async listMembers(businessId: string): Promise<MemberListResponse> {
    const [members, invitations] = await Promise.all([
      memberDal.listMembers(businessId),
      memberDal.listPendingInvitations(businessId, new Date()),
    ]);

    return {
      members: members.map((member) => this.toMemberResponse(member)),
      invitations: invitations.map((invitation) =>
        this.toInvitationResponse(invitation),
      ),
    };
  }

  public async inviteMember(
    businessId: string,
    invitedByUserId: string,
    request: InviteMemberRequest,
  ): Promise<InviteMemberResponse> {
    const email = normalizeEmail(request.email);
    const existingUser = await memberDal.findUserIdByEmail(email);

    if (existingUser) {
      try {
        const member = await memberDal.createMembership(
          businessId,
          existingUser.id,
          request.role,
        );

        return { member: this.toMemberResponse(member) };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new AppError(
            409,
            ERROR_CODES.MEMBER_ALREADY_EXISTS,
            ERROR_MESSAGES.MEMBER_ALREADY_EXISTS,
          );
        }

        throw error;
      }
    }

    const invitation = await memberDal.upsertInvitation({
      businessId,
      email,
      role: request.role,
      invitedByUserId,
      expiresAt: new Date(
        Date.now() + BUSINESS_CONSTANTS.INVITATION_TTL_DAYS * MILLISECONDS_PER_DAY,
      ),
    });

    return { invitation: this.toInvitationResponse(invitation) };
  }

  public async updateMemberRole(
    businessId: string,
    membershipId: string,
    request: UpdateMemberRoleRequest,
  ): Promise<MemberResponse> {
    assertUuid("membershipId", membershipId);

    try {
      const member = await memberDal.updateMemberRole(
        businessId,
        membershipId,
        request.role,
      );

      return this.toMemberResponse(member);
    } catch (error) {
      if (!isRecordNotFoundError(error)) throw error;
      return this.throwForMissingMember(businessId, membershipId);
    }
  }

  public async removeMember(
    businessId: string,
    membershipId: string,
  ): Promise<void> {
    assertUuid("membershipId", membershipId);

    try {
      await memberDal.deleteMember(businessId, membershipId);
    } catch (error) {
      if (!isRecordNotFoundError(error)) throw error;
      await this.throwForMissingMember(businessId, membershipId);
    }
  }

  public async revokeInvitation(
    businessId: string,
    invitationId: string,
  ): Promise<void> {
    assertUuid("invitationId", invitationId);

    try {
      await memberDal.deleteInvitation(businessId, invitationId);
    } catch (error) {
      if (!isRecordNotFoundError(error)) throw error;

      throw new AppError(
        404,
        ERROR_CODES.INVITATION_NOT_FOUND,
        ERROR_MESSAGES.INVITATION_NOT_FOUND,
      );
    }
  }

  public acceptPendingInvitations(userId: string, email: string): Promise<number> {
    return memberDal.acceptPendingInvitations(
      userId,
      normalizeEmail(email),
      new Date(),
    );
  }

  private async throwForMissingMember(
    businessId: string,
    membershipId: string,
  ): Promise<never> {
    const member = await memberDal.findMember(businessId, membershipId);

    if (member?.role === "OWNER") {
      throw new AppError(
        409,
        ERROR_CODES.MEMBER_CHANGE_NOT_ALLOWED,
        ERROR_MESSAGES.MEMBER_CHANGE_NOT_ALLOWED,
      );
    }

    throw new AppError(
      404,
      ERROR_CODES.MEMBER_NOT_FOUND,
      ERROR_MESSAGES.MEMBER_NOT_FOUND,
    );
  }

  private toMemberResponse(member: MemberRecord): MemberResponse {
    return {
      id: member.id,
      userId: member.userId,
      fullName: member.user.fullName,
      email: member.user.email,
      role: member.role,
      createdAt: member.createdAt,
    };
  }

  private toInvitationResponse(invitation: InvitationRecord): InvitationResponse {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }
}

export const memberService = new MemberService();
