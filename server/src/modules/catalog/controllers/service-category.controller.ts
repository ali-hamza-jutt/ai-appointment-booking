import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { catalogService } from "../catalog.service.js";
import type {
  CreateServiceCategoryRequest,
  ServiceCategoryListResponse,
  ServiceCategoryResponse,
  UpdateServiceCategoryRequest,
} from "../dto/catalog.dto.js";

@Route("businesses/{businessId}/service-categories")
@Tags("Catalog")
export class ServiceCategoryController extends Controller {
  /** Lists service categories in display order. */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Categories retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listServiceCategories(
    @Path() businessId: string,
  ): Promise<ServiceCategoryListResponse> {
    return catalogService.listCategories(businessId);
  }

  /** Creates a service category. */
  @Post()
  @Security("jwt", ["business:manage"])
  @SuccessResponse("201", "Category created")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(409, "Category name already exists")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createServiceCategory(
    @Path() businessId: string,
    @Body() body: CreateServiceCategoryRequest,
  ): Promise<ServiceCategoryResponse> {
    this.setStatus(201);
    return catalogService.createCategory(businessId, body);
  }

  /** Renames or reorders a category. */
  @Patch("{categoryId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Category updated")
  @Response<ApiErrorResponse>(404, "Category was not found")
  @Response<ApiErrorResponse>(409, "Category name already exists")
  public updateServiceCategory(
    @Path() businessId: string,
    @Path() categoryId: string,
    @Body() body: UpdateServiceCategoryRequest,
  ): Promise<ServiceCategoryResponse> {
    return catalogService.updateCategory(businessId, categoryId, body);
  }

  /** Deletes a category; its services become uncategorized. */
  @Delete("{categoryId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("204", "Category deleted")
  @Response<ApiErrorResponse>(404, "Category was not found")
  public async deleteServiceCategory(
    @Path() businessId: string,
    @Path() categoryId: string,
  ): Promise<void> {
    await catalogService.deleteCategory(businessId, categoryId);
    this.setStatus(204);
  }
}
