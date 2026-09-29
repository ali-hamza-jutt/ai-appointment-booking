"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { PlusIcon, RefreshIcon, SearchIcon, UsersIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { CustomerProfileModal } from "@/features/customers/components/customer-profile-modal";
import { CUSTOMER_UI_CONSTANTS } from "@/features/customers/constants/customer-ui.constants";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import {
  getListCustomersQueryKey,
  useCreateCustomer,
} from "@/generated/api/customers/customers";
import type { BusinessSummaryResponse, CustomerResponse } from "@/generated/api/models";
import { useSearchParamQuery } from "@/hooks/use-search-param-state";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";
import { formatDate } from "@/lib/utils/date-time";

export function CustomersView() {
  return (
    <BusinessRequired>
      {(business) => <CustomersContent business={business} />}
    </BusinessRequired>
  );
}

function CustomersContent({ business }: { business: BusinessSummaryResponse }) {
  const queryClient = useQueryClient();
  const { search, setSearch, query: debouncedSearch } = useSearchParamQuery(
    "q",
    CUSTOMER_UI_CONSTANTS.SEARCH_DEBOUNCE_MS,
  );
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [profileCustomer, setProfileCustomer] = useState<CustomerResponse | null>(null);
  const customersQuery = useCustomers(business.id, debouncedSearch);
  const customers = customersQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button
            leadingIcon={<PlusIcon className="size-4" />}
            onClick={() => setIsAddOpen(true)}
          >
            Add customer
          </Button>
        }
        description="Everyone who has booked with you or been added by your team."
        title="Customers"
      />

      <div className="mb-5 max-w-sm">
        <TextField
          hideLabel
          id="customer-search"
          label="Search customers"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, email or phone"
          trailingAction={<SearchIcon className="mr-2.5 size-4 text-subtle" />}
          type="search"
          value={search}
        />
      </div>

      {customersQuery.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : customersQuery.isError && customers.length === 0 ? (
        <Alert tone="danger">
          {getApiErrorMessage(customersQuery.error, "Customers could not be loaded.")}
        </Alert>
      ) : customers.length === 0 ? (
        <EmptyState
          description={
            debouncedSearch
              ? "No customers match your search."
              : "Customers appear here after their first booking, or when you add them."
          }
          icon={UsersIcon}
          title={debouncedSearch ? "No matches" : "No customers yet"}
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Phone</TableHeaderCell>
                <TableHeaderCell>Added</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-semibold text-ink">
                    <span className="flex items-center gap-2">
                      {customer.name}
                      {customer.hasAccount ? <Badge tone="brand">Account</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell>{customer.email ?? "—"}</TableCell>
                  <TableCell>{customer.phone ?? "—"}</TableCell>
                  <TableCell>{formatDate(customer.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      aria-label={`View ${customer.name}'s profile`}
                      onClick={() => setProfileCustomer(customer)}
                      size="sm"
                      variant="ghost"
                    >
                      Profile
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {customersQuery.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button
                isLoading={customersQuery.isFetchingNextPage}
                leadingIcon={<RefreshIcon className="size-4" />}
                onClick={() => void customersQuery.fetchNextPage()}
                variant="secondary"
              >
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}

      {profileCustomer ? (
        <CustomerProfileModal
          businessId={business.id}
          customer={profileCustomer}
          onClose={() => setProfileCustomer(null)}
        />
      ) : null}

      {isAddOpen ? (
        <AddCustomerModal
          businessId={business.id}
          onClose={() => setIsAddOpen(false)}
          onCreated={() => {
            void queryClient.invalidateQueries({
              queryKey: getListCustomersQueryKey(business.id),
            });
            setIsAddOpen(false);
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function AddCustomerModal({
  businessId,
  onClose,
  onCreated,
}: {
  businessId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const createMutation = useCreateCustomer();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const error = createMutation.error;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    createMutation.mutate(
      {
        businessId,
        data: {
          name,
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        },
      },
      { onSuccess: onCreated },
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="Add customer">
      <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
        {error ? (
          <Alert tone="danger">
            {getApiErrorMessage(error, "The customer could not be added.")}
          </Alert>
        ) : null}
        <TextField
          autoComplete="name"
          error={getApiFieldError(error, "name")}
          id="customer-name"
          label="Full name"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
        <TextField
          autoComplete="email"
          error={getApiFieldError(error, "email")}
          id="customer-email"
          label="Email (optional)"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
        <TextField
          autoComplete="tel"
          error={getApiFieldError(error, "phone")}
          id="customer-phone"
          label="Phone (optional)"
          maxLength={32}
          onChange={(event) => setPhone(event.target.value)}
          type="tel"
          value={phone}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button isLoading={createMutation.isPending} type="submit">
            Add customer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
