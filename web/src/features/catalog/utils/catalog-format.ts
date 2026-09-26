import { CATALOG_UI_CONSTANTS } from "@/features/catalog/constants/catalog-ui.constants";
import type {
  ServiceCategoryResponse,
  ServiceResponse,
} from "@/generated/api/models";

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (remainder === 0) return `${hours} h`;
  return `${hours} h ${remainder} min`;
}

export interface ServiceGroup {
  id: string;
  name: string;
  services: ServiceResponse[];
}

const UNCATEGORIZED_GROUP_ID = "uncategorized";

/** Groups services in category display order, with uncategorized ones last. */
export function groupServicesByCategory(
  services: ServiceResponse[],
  categories: ServiceCategoryResponse[],
): ServiceGroup[] {
  const groups: ServiceGroup[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    services: services.filter((service) => service.category?.id === category.id),
  }));
  const uncategorized = services.filter((service) => !service.category);

  if (uncategorized.length > 0) {
    groups.push({
      id: UNCATEGORIZED_GROUP_ID,
      name: CATALOG_UI_CONSTANTS.UNCATEGORIZED_LABEL,
      services: uncategorized,
    });
  }

  return groups.filter((group) => group.services.length > 0);
}
