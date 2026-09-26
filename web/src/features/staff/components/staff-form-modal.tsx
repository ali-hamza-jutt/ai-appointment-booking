"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  CheckboxField,
  CheckboxList,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import type { ProviderLabels } from "@/features/staff/utils/staff-labels";
import type {
  LocationResponse,
  MemberResponse,
  ServiceResponse,
  StaffResponse,
} from "@/generated/api/models";
import { useCreateStaff, useUpdateStaff } from "@/generated/api/staff/staff";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";
import { formatDuration } from "@/features/catalog/utils/catalog-format";

interface StaffFormModalProps {
  businessId: string;
  labels: ProviderLabels;
  linkedUserIds: string[];
  locations: LocationResponse[];
  members: MemberResponse[];
  onClose: () => void;
  onSaved: () => void;
  services: ServiceResponse[];
  staff?: StaffResponse;
}

export function StaffFormModal({
  businessId,
  labels,
  linkedUserIds,
  locations,
  members,
  onClose,
  onSaved,
  services,
  staff,
}: StaffFormModalProps) {
  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const [displayName, setDisplayName] = useState(staff?.displayName ?? "");
  const [email, setEmail] = useState(staff?.email ?? "");
  const [bio, setBio] = useState(staff?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(staff?.avatarUrl ?? "");
  const [userId, setUserId] = useState(staff?.userId ?? "");
  const [isActive, setIsActive] = useState(staff?.isActive ?? true);
  const [serviceIds, setServiceIds] = useState<string[]>(
    staff?.services.map((service) => service.serviceId) ?? [],
  );
  const [locationIds, setLocationIds] = useState<string[]>(
    staff?.locations.map((location) => location.id) ?? [],
  );
  const mutation = staff ? updateMutation : createMutation;
  const error = mutation.error;
  const linkableMembers = members.filter(
    (member) => member.userId === staff?.userId || !linkedUserIds.includes(member.userId),
  );
  const existingOverrides = new Map(
    staff?.services.map((service) => [service.serviceId, service]) ?? [],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const assignments = serviceIds.map((serviceId) => {
      const override = existingOverrides.get(serviceId);

      return {
        serviceId,
        customDurationMinutes: override?.customDurationMinutes ?? null,
        customPriceMinor: override?.customPriceMinor ?? null,
      };
    });

    if (staff) {
      updateMutation.mutate(
        {
          businessId,
          staffId: staff.id,
          data: {
            displayName,
            email: email.trim() || null,
            bio: bio.trim() || null,
            avatarUrl: avatarUrl.trim() || null,
            userId: userId || null,
            isActive,
            services: assignments,
            locationIds,
          },
        },
        { onSuccess: onSaved },
      );
      return;
    }

    createMutation.mutate(
      {
        businessId,
        data: {
          displayName,
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(bio.trim() ? { bio: bio.trim() } : {}),
          ...(avatarUrl.trim() ? { avatarUrl: avatarUrl.trim() } : {}),
          ...(userId ? { userId } : {}),
          services: assignments,
          locationIds,
        },
      },
      { onSuccess: onSaved },
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={staff ? `Edit ${staff.displayName}` : `Add ${labels.singular.toLowerCase()}`}
    >
      <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
        {error ? (
          <Alert tone="danger">
            {getApiErrorMessage(error, "The staff member could not be saved.")}
          </Alert>
        ) : null}

        <TextField
          error={getApiFieldError(error, "displayName")}
          id="staff-display-name"
          label="Display name"
          maxLength={80}
          onChange={(event) => setDisplayName(event.target.value)}
          value={displayName}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            error={getApiFieldError(error, "email")}
            id="staff-email"
            label="Email (optional)"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
          <SelectField
            error={getApiFieldError(error, "userId")}
            hint="Lets this person sign in and see their own schedule."
            id="staff-user"
            label="Linked team member"
            onChange={(event) => setUserId(event.target.value)}
            value={userId}
          >
            <option value="">Not linked</option>
            {linkableMembers.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
              </option>
            ))}
          </SelectField>
        </div>

        <TextField
          error={getApiFieldError(error, "avatarUrl")}
          hint="An https image link."
          id="staff-avatar-url"
          label="Photo URL (optional)"
          maxLength={500}
          onChange={(event) => setAvatarUrl(event.target.value)}
          type="url"
          value={avatarUrl}
        />

        <TextAreaField
          error={getApiFieldError(error, "bio")}
          id="staff-bio"
          label="Bio (optional)"
          maxLength={1000}
          onChange={(event) => setBio(event.target.value)}
          value={bio}
        />

        <CheckboxList
          emptyMessage="Add services first to assign them."
          id="staff-services"
          label="Services offered"
          onChange={setServiceIds}
          options={services.map((service) => ({
            value: service.id,
            label: service.name,
            description: formatDuration(service.durationMinutes),
          }))}
          values={serviceIds}
        />

        <CheckboxList
          hint="Leave empty if this person works at every location."
          id="staff-locations"
          label="Locations"
          onChange={setLocationIds}
          options={locations.map((location) => ({ value: location.id, label: location.name }))}
          values={locationIds}
        />

        {staff ? (
          <CheckboxField
            checked={isActive}
            hint="Inactive staff cannot be booked."
            id="staff-active"
            label="Accepting bookings"
            onChange={(event) => setIsActive(event.target.checked)}
          />
        ) : null}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} type="submit">
            {staff ? "Save changes" : `Add ${labels.singular.toLowerCase()}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
