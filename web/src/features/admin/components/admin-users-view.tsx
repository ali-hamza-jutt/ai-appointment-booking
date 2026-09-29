"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { useImpersonation } from "@/features/admin/hooks/use-impersonation";
import { useListAdminUsers } from "@/generated/api/platform-admin/platform-admin";
import { useSearchParamQuery } from "@/hooks/use-search-param-state";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDate } from "@/lib/utils/date-time";

/** Everyone with an account, to find and support a customer or business owner. */
export function AdminUsersView() {
  const { search, setSearch, query: debounced } = useSearchParamQuery("q", 300);
  const usersQuery = useListAdminUsers(debounced ? { search: debounced } : {});
  const impersonation = useImpersonation();
  const users = usersQuery.data?.items ?? [];

  return (
    <PageContainer size="wide">
      <PageHeader
        description="Sign in as someone to see what they see. It lasts 15 minutes and is recorded, with every change you make."
        title="People"
      />
      <div className="mb-4 max-w-sm">
        <TextField
          hideLabel
          id="admin-user-search"
          label="Search people"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by email or name"
          value={search}
        />
      </div>
      {impersonation.error ? (
        <Alert className="mb-4" tone="danger">
          {getApiErrorMessage(impersonation.error, "You can't sign in as this person.")}
        </Alert>
      ) : null}
      {usersQuery.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : usersQuery.isError ? (
        <Alert tone="danger">{getApiErrorMessage(usersQuery.error, "People could not be loaded.")}</Alert>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Joined</TableHeaderCell>
              <TableHeaderCell>{null}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((person) => (
              <TableRow key={person.id}>
                <TableCell>
                  {person.fullName}
                  {person.platformRole === "ADMIN" ? <Badge className="ml-2" tone="brand">Admin</Badge> : null}
                  <span className="block text-xs text-muted">{person.email}</span>
                </TableCell>
                <TableCell>{formatDate(person.createdAt)}</TableCell>
                <TableCell>
                  {person.platformRole === "ADMIN" ? null : (
                    <Button
                      isLoading={impersonation.isPending && impersonation.variables?.userId === person.id}
                      onClick={() => impersonation.mutate({ userId: person.id })}
                      size="sm"
                      variant="secondary"
                    >
                      Sign in as
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageContainer>
  );
}
