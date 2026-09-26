import { prisma } from "../../../infrastructure/database/prisma.js";
import type {
  CreateInvitationData,
  InvitationRecord,
  MemberRecord,
  MembershipRole,
} from "../dto/business.dto.js";

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { fullName: true, email: true } },
} as const;

const invitationSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
} as const;

export class MemberDal {
  public listMembers(businessId: string): Promise<MemberRecord[]> {
    return prisma.membership.findMany({
      where: { businessId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: memberSelect,
    });
  }

  public listPendingInvitations(
    businessId: string,
    now: Date,
  ): Promise<InvitationRecord[]> {
    return prisma.businessInvitation.findMany({
      where: { businessId, expiresAt: { gt: now } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: invitationSelect,
    });
  }

  public findUserIdByEmail(email: string): Promise<{ id: string } | null> {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
  }

  public createMembership(
    businessId: string,
    userId: string,
    role: MembershipRole,
  ): Promise<MemberRecord> {
    return prisma.membership.create({
      data: { businessId, userId, role },
      select: memberSelect,
    });
  }

  public upsertInvitation(data: CreateInvitationData): Promise<InvitationRecord> {
    return prisma.businessInvitation.upsert({
      where: {
        businessId_email: { businessId: data.businessId, email: data.email },
        businessId: data.businessId,
      },
      create: data,
      update: {
        role: data.role,
        expiresAt: data.expiresAt,
        invitedByUserId: data.invitedByUserId,
      },
      select: invitationSelect,
    });
  }

  public findMember(
    businessId: string,
    membershipId: string,
  ): Promise<MemberRecord | null> {
    return prisma.membership.findFirst({
      where: { id: membershipId, businessId },
      select: memberSelect,
    });
  }

  public updateMemberRole(
    businessId: string,
    membershipId: string,
    role: MembershipRole,
  ): Promise<MemberRecord> {
    return prisma.membership.update({
      where: { id: membershipId, businessId, role: { not: "OWNER" } },
      data: { role },
      select: memberSelect,
    });
  }

  public async deleteMember(
    businessId: string,
    membershipId: string,
  ): Promise<void> {
    await prisma.membership.delete({
      where: { id: membershipId, businessId, role: { not: "OWNER" } },
    });
  }

  public async deleteInvitation(
    businessId: string,
    invitationId: string,
  ): Promise<void> {
    await prisma.businessInvitation.delete({
      where: { id: invitationId, businessId },
    });
  }

  /** Converts unexpired invitations for this email into memberships. */
  public acceptPendingInvitations(
    userId: string,
    email: string,
    now: Date,
  ): Promise<number> {
    return prisma.$transaction(async (transaction) => {
      const invitations = await transaction.businessInvitation.findMany({
        where: { email, expiresAt: { gt: now } },
        select: { businessId: true, role: true },
      });

      if (invitations.length > 0) {
        await transaction.membership.createMany({
          data: invitations.map((invitation) => ({
            businessId: invitation.businessId,
            userId,
            role: invitation.role,
          })),
          skipDuplicates: true,
        });
      }

      await transaction.businessInvitation.deleteMany({ where: { email } });

      return invitations.length;
    });
  }
}

export const memberDal = new MemberDal();
