"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { FolderIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import {
  getListServiceCategoriesQueryKey,
  getListServicesQueryKey,
  useCreateServiceCategory,
  useDeleteServiceCategory,
} from "@/generated/api/catalog/catalog";
import type { ServiceCategoryResponse } from "@/generated/api/models";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";

interface CategoriesModalProps {
  businessId: string;
  categories: ServiceCategoryResponse[];
  onClose: () => void;
}

export function CategoriesModal({ businessId, categories, onClose }: CategoriesModalProps) {
  const queryClient = useQueryClient();
  const createMutation = useCreateServiceCategory();
  const deleteMutation = useDeleteServiceCategory();
  const [name, setName] = useState("");
  const error = createMutation.error ?? deleteMutation.error;

  function refreshCatalog() {
    void queryClient.invalidateQueries({
      queryKey: getListServiceCategoriesQueryKey(businessId),
    });
    void queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(businessId) });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) return;

    createMutation.mutate(
      { businessId, data: { name, sortOrder: categories.length } },
      {
        onSuccess: () => {
          setName("");
          refreshCatalog();
        },
      },
    );
  }

  return (
    <Modal
      description="Group services so customers can find them quickly."
      isOpen
      onClose={onClose}
      title="Service categories"
    >
      <div className="space-y-5 p-5 sm:p-6">
        {error ? (
          <Alert tone="danger">
            {getApiErrorMessage(error, "Categories could not be updated.")}
          </Alert>
        ) : null}

        {categories.length === 0 ? (
          <p className="text-sm text-muted">No categories yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-[10px] border border-border">
            {categories.map((category) => (
              <li className="flex items-center gap-3 px-3 py-2.5" key={category.id}>
                <FolderIcon className="size-4 text-muted" />
                <span className="flex-1 truncate text-sm font-medium text-ink">
                  {category.name}
                </span>
                <Button
                  aria-label={`Delete ${category.name}`}
                  disabled={deleteMutation.isPending}
                  onClick={() =>
                    deleteMutation.mutate(
                      { businessId, categoryId: category.id },
                      { onSuccess: refreshCatalog },
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  <TrashIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form className="flex items-end gap-2" noValidate onSubmit={handleSubmit}>
          <div className="flex-1">
            <TextField
              error={getApiFieldError(createMutation.error, "name")}
              id="category-name"
              label="New category"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="Hair"
              value={name}
            />
          </div>
          <Button
            className="mb-px"
            isLoading={createMutation.isPending}
            leadingIcon={<PlusIcon className="size-4" />}
            type="submit"
            variant="secondary"
          >
            Add
          </Button>
        </form>
      </div>
    </Modal>
  );
}
