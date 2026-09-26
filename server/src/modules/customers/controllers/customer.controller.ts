import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Query,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { customerService } from "../customer.service.js";
import type {
  CreateCustomerRequest,
  CustomerListResponse,
  CustomerResponse,
} from "../dto/customer.dto.js";

@Route("businesses/{businessId}/customers")
@Tags("Customers")
export class CustomerController extends Controller {
  /**
   * Lists the business's customers, newest first.
   * @param search Matches name, email or phone.
   * @isInt limit Limit must be a whole number
   * @minimum limit 1
   * @maximum limit 50
   */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Customers retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  @Response<ApiErrorResponse>(422, "Pagination parameters are invalid")
  public listCustomers(
    @Path() businessId: string,
    @Query() search?: string,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<CustomerListResponse> {
    return customerService.listCustomers(businessId, {
      ...(search ? { search } : {}),
      ...(cursor ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  /** Adds a customer record, for example a walk-in or phone booking. */
  @Post()
  @Security("jwt", ["business:operate"])
  @SuccessResponse("201", "Customer created")
  @Response<ApiErrorResponse>(404, "Business was not found")
  @Response<ApiErrorResponse>(409, "A customer with this email already exists")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createCustomer(
    @Path() businessId: string,
    @Body() body: CreateCustomerRequest,
  ): Promise<CustomerResponse> {
    this.setStatus(201);
    return customerService.createCustomer(businessId, body);
  }
}
