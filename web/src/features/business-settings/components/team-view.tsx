"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/form-controls";
import { MailIcon, PlusIcon, TrashIcon, UsersIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { useAuth } from "@/features/auth/auth-context";
import { getUserInitials } from "@/features/auth/utils/user-display";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import {
  INVITABLE_ROLE_OPTIONS,
  ROLE_LABELS,
  ROLE_TONES,
} from "@/features/business-settings/constants/business-ui.constants";
import {
  canManageBusiness,
  isBusinessOwner,
} from "@/features/business-settings/utils/business-permissions";
import type {
  BusinessSummaryResponse,
  InvitableMembershipRole,
  MemberResponse,
} from "@/generated/api/models";
import {
  getListMembersQueryKey,
  useInviteMember,
  useListMembers,
  useRemoveMember,
  useRevokeInvitation,
  useUpdateMemberRole,
} from "@/generated/api/team/team";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";
import { formatDate } from "@/lib/utils/date-time";

export function TeamView() {
  return (
    <BusinessRequired>
      {(business) => <TeamContent business={business} />}
    </BusinessRequired>
  );
}

function TeamContent({ business }: { business: BusinessSummaryResponse }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const membersQuery = useListMembers(business.id);
  const updateRoleMutation = useUpdateMemberRole();
  const removeMutation = useRemoveMember();
  const revokeMutation = useRevokeInvitation();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<MemberResponse | null>(null);
  const canManage = canManageBusiness(business.role);
  const isOwner = isBusinessOwner(business.role);
  const actionError =
    updateRoleMutation.error ?? removeMutation.error ?? revokeMutation.error;

  function refreshTeam() {
    void queryClient.invalidateQueries({
      queryKey: getListMembersQueryKey(business.id),
    });
  }

  function changeRole(member: MemberResponse, role: InvitableMembershipRole) {
    updateRoleMutation.mutate(
      { businessId: business.id, membershipId: member.id, data: { role } },
      { onSuccess: refreshTeam },
    );
  }

  function confirmRemoval() {
    if (!memberToRemove) return;

    removeMutation.mutate(
      { businessId: business.id, membershipId: memberToRemove.id },
      {
        onSuccess: () => {
          setMemberToRemove(null);
          refreshTeam();
        },
      },
    );
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          canManage ? (
            <Button
              leadingIcon={<PlusIcon className="size-4" />}
              onClick={() => setIsInviteOpen(true)}
            >
              Invite member
            </Button>
          ) : null
        }
        description="People who can manage bookings for this business."
        title="Team"
      />

      {actionError ? (
        <Alert className="mb-4" tone="danger">
          {getApiErrorMessage(actionError, "The team could not be updated.")}
        </Alert>
      ) : null}

      {membersQuery.isPending ? (
        <Skeleton className="h-60 rounded-xl" />
      ) : membersQuery.isError ? (
        <Alert tone="danger">
          {getApiErrorMessage(membersQuery.error, "The team could not be loaded.")}
        </Alert>
      ) : (
        <div className="space-y-6">
          <SectionCard title={`Members (${membersQuery.data.members.length})`}>
            <ul className="divide-y divide-border">
              {membersQuery.data.members.map((member) => {
                const isSelf = member.userId === user?.id;
                const isMemberOwner = member.role === "OWNER";

                return (
                  <li
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                    key={member.id}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">
                      {getUserInitials(member.fullName) || "BW"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {member.fullName}
                        {isSelf ? <span className="font-normal text-muted"> (you)</span> : null}
                      </p>
                      <p className="truncate text-xs text-muted">{member.email}</p>
                    </div>
                    {isOwner && !isMemberOwner ? (
                      <SelectField
                        className="h-9 w-32"
                        disabled={updateRoleMutation.isPending}
                        hideLabel
                        id={`member-role-${member.id}`}
                        label={`Role for ${member.fullName}`}
                        onChange={(event) =>
                          changeRole(member, event.target.value as InvitableMembershipRole)
                        }
                        value={member.role}
                      >
                        {INVITABLE_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </SelectField>
                    ) : (
                      <Badge tone={ROLE_TONES[member.role]}>{ROLE_LABELS[member.role]}</Badge>
                    )}
                    {canManage && !isMemberOwner ? (
                      <Button
                        aria-label={`Remove ${member.fullName}`}
                        onClick={() => setMemberToRemove(member)}
                        size="sm"
                        variant="ghost"
                      >
                        <TrashIcon className="size-4" />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          <SectionCard
            description="Invitations are accepted automatically when the person signs up with this email."
            title="Pending invitations"
          >
            {membersQuery.data.invitations.length === 0 ? (
              <p className="text-sm text-muted">No pending invitations.</p>
            ) : (
              <ul className="divide-y divide-border">
                {membersQuery.data.invitations.map((invitation) => (
                  <li
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                    key={invitation.id}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-muted">
                      <MailIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{invitation.email}</p>
                      <p className="text-xs text-muted">
                        Expires {formatDate(invitation.expiresAt)}
                      </p>
                    </div>
                    <Badge tone={ROLE_TONES[invitation.role]}>{ROLE_LABELS[invitation.role]}</Badge>
                    {canManage ? (
                      <Button
                        disabled={revokeMutation.isPending}
                        onClick={() =>
                          revokeMutation.mutate(
                            { businessId: business.id, invitationId: invitation.id },
                            { onSuccess: refreshTeam },
                          )
                        }
                        size="sm"
                        variant="ghost"
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}

      {isInviteOpen ? (
        <InviteMemberModal
          businessId={business.id}
          onClose={() => setIsInviteOpen(false)}
          onInvited={() => {
            refreshTeam();
            setIsInviteOpen(false);
          }}
        />
      ) : null}

      <Modal
        description={
          memberToRemove
            ? `${memberToRemove.fullName} will lose access to ${business.name}.`
            : undefined
        }
        isOpen={memberToRemove !== null}
        onClose={() => setMemberToRemove(null)}
        title="Remove team member?"
      >
        <div className="flex justify-end gap-2 p-5 sm:p-6">
          <Button onClick={() => setMemberToRemove(null)} variant="secondary">
            Keep member
          </Button>
          <Button
            isLoading={removeMutation.isPending}
            leadingIcon={<UsersIcon className="size-4" />}
            onClick={confirmRemoval}
            variant="danger"
          >
            Remove
          </Button>
        </div>
      </Modal>
    </PageContainer>
  );
}

function InviteMemberModal({
  businessId,
  onClose,
  onInvited,
}: {
  businessId: string;
  onClose: () => void;
  onInvited: () => void;
}) {
  const inviteMutation = useInviteMember();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableMembershipRole>("STAFF");
  const error = inviteMutation.error;
  const selectedRole = INVITABLE_ROLE_OPTIONS.find((option) => option.value === role);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    inviteMutation.mutate({ businessId, data: { email, role } }, { onSuccess: onInvited });
  }

  return (
    <Modal
      description="Existing BookWise users join immediately."
      isOpen
      onClose={onClose}
      title="Invite a team member"
    >
      <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
        {error ? (
          <Alert tone="danger">
            {getApiErrorMessage(error, "The invitation could not be sent.")}
          </Alert>
        ) : null}
        <TextField
          autoComplete="email"
          error={getApiFieldError(error, "email")}
          id="invite-email"
          label="Email address"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <SelectField
          hint={selectedRole?.description}
          id="invite-role"
          label="Role"
          onChange={(event) => setRole(event.target.value as InvitableMembershipRole)}
          value={role}
        >
          {INVITABLE_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button isLoading={inviteMutation.isPending} type="submit">
            Send invitation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
