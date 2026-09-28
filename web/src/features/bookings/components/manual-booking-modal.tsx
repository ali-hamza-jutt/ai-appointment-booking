"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { SlotPicker } from "@/features/availability/components/slot-picker";
import { useBusinessDaySlots } from "@/features/availability/hooks/use-day-slots";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import { CUSTOMER_UI_CONSTANTS } from "@/features/customers/constants/customer-ui.constants";
import { useCreateBooking } from "@/generated/api/bookings/bookings";
import type {
  AvailableSlot,
  BookingResponse,
  ServiceResponse,
  StaffResponse,
} from "@/generated/api/models";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";

type CustomerMode = "existing" | "new";

interface ManualBookingModalProps {
  businessId: string;
  initialDate: string;
  /** Pre-selects this provider, for example from a calendar column. */
  initialStaffId?: string;
  /** Pre-selects this time once it shows up among the open times. */
  initialStartsAt?: string;
  onClose: () => void;
  onCreated: (booking: BookingResponse) => void;
  services: ServiceResponse[];
  staff: StaffResponse[];
  timeZone: string;
}

export function ManualBookingModal({
  businessId,
  initialDate,
  initialStaffId,
  initialStartsAt,
  onClose,
  onCreated,
  services,
  staff,
  timeZone,
}: ManualBookingModalProps) {
  const createMutation = useCreateBooking();
  const [customerMode, setCustomerMode] = useState<CustomerMode>("existing");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState(() => {
    const provider = staff.find((member) => member.id === initialStaffId);
    const offered = services.find((service) => provider?.services.some((item) => item.serviceId === service.id));

    return (offered ?? services[0])?.id ?? "";
  });
  const [staffId, setStaffId] = useState(initialStaffId ?? "");
  const [date, setDate] = useState(initialDate);
  const [picked, setPicked] = useState<AvailableSlot | null>(null);
  // The clicked time counts as picked until the user changes the service, provider or date.
  const [preferredStartsAt, setPreferredStartsAt] = useState(initialStartsAt ?? null);
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(
    customerSearch.trim(),
    CUSTOMER_UI_CONSTANTS.SEARCH_DEBOUNCE_MS,
  );
  const customersQuery = useCustomers(businessId, debouncedSearch);
  const customers = customersQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const providers = staff.filter(
    (member) =>
      member.isActive && member.services.some((service) => service.serviceId === serviceId),
  );
  const daySlots = useBusinessDaySlots(businessId, {
    date,
    serviceId,
    timeZone,
    ...(staffId ? { staffId } : {}),
  });
  const error = createMutation.error;
  const slot =
    picked ??
    (preferredStartsAt
      ? (daySlots.slots.find((open) => new Date(open.startsAt).getTime() === new Date(preferredStartsAt).getTime()) ?? null)
      : null);

  function setSlot(next: AvailableSlot | null) {
    setPicked(next);
    setPreferredStartsAt(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!slot || !serviceId) {
      setFormError("Choose a service and an open time.");
      return;
    }

    if (customerMode === "existing" && !customerId) {
      setFormError("Choose a customer, or add a new one.");
      return;
    }

    if (customerMode === "new" && name.trim().length < 2) {
      setFormError("Enter the customer's name.");
      return;
    }

    setFormError(null);
    createMutation.mutate(
      {
        businessId,
        data: {
          serviceId,
          startsAt: String(slot.startsAt),
          ...(staffId ? { staffId } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(customerMode === "existing"
            ? { customerId }
            : {
                customer: {
                  name: name.trim(),
                  ...(email.trim() ? { email: email.trim() } : {}),
                  ...(phone.trim() ? { phone: phone.trim() } : {}),
                },
              }),
        },
      },
      { onSuccess: onCreated },
    );
  }

  return (
    <Modal
      description="Book a walk-in or phone customer. The booking is confirmed straight away."
      isOpen
      onClose={() => !createMutation.isPending && onClose()}
      title="New booking"
    >
      <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
        {formError || error ? (
          <Alert tone="danger">
            {formError ?? getApiErrorMessage(error, "The booking could not be created.")}
          </Alert>
        ) : null}

        <div>
          <Tabs
            ariaLabel="Customer"
            className="mb-3"
            onChange={setCustomerMode}
            options={[
              { label: "Existing customer", value: "existing" },
              { label: "New customer", value: "new" },
            ]}
            value={customerMode}
          />
          {customerMode === "existing" ? (
            <div className="space-y-3">
              <TextField
                hideLabel
                id="manual-customer-search"
                label="Search customers"
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Search by name, email or phone"
                type="search"
                value={customerSearch}
              />
              <SelectField
                hideLabel
                id="manual-customer"
                label="Customer"
                onChange={(event) => setCustomerId(event.target.value)}
                value={customerId}
              >
                <option value="">
                  {customers.length === 0 ? "No customers found" : "Choose a customer"}
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.email ? ` · ${customer.email}` : ""}
                  </option>
                ))}
              </SelectField>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                error={getApiFieldError(error, "name")}
                id="manual-customer-name"
                label="Name"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
              <TextField
                error={getApiFieldError(error, "phone")}
                id="manual-customer-phone"
                label="Phone (optional)"
                onChange={(event) => setPhone(event.target.value)}
                type="tel"
                value={phone}
              />
              <div className="sm:col-span-2">
                <TextField
                  error={getApiFieldError(error, "email")}
                  id="manual-customer-email"
                  label="Email (optional)"
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  value={email}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id="manual-service"
            label="Service"
            onChange={(event) => {
              setServiceId(event.target.value);
              setStaffId("");
              setSlot(null);
            }}
            value={serviceId}
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
                {service.onlineBookable ? "" : " (staff only)"}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="manual-staff"
            label="With"
            onChange={(event) => {
              setStaffId(event.target.value);
              setSlot(null);
            }}
            value={staffId}
          >
            <option value="">Anyone available</option>
            {providers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </SelectField>
        </div>

        <SlotPicker
          date={date}
          error={daySlots.error}
          idPrefix="manual-booking"
          isLoading={daySlots.isLoading}
          onDateChange={(value) => {
            setDate(value);
            setSlot(null);
          }}
          onSelect={setSlot}
          selectedStartsAt={slot ? String(slot.startsAt) : null}
          slots={daySlots.slots}
          timeZone={timeZone}
        />

        <TextAreaField
          id="manual-notes"
          label="Notes (optional)"
          maxLength={2000}
          onChange={(event) => setNotes(event.target.value)}
          value={notes}
        />

        <div className="flex justify-end gap-2">
          <Button disabled={createMutation.isPending} onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button disabled={!slot} isLoading={createMutation.isPending} type="submit">
            Book customer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
