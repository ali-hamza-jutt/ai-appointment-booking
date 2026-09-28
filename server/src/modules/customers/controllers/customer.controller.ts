import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Put,
  Query,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { customerProfileService } from "../customer-profile.service.js";
import { customerService } from "../customer.service.js";
import type { CustomerProfileResponse } from "../dto/customer-profile.dto.js";
import type {
  CreateCustomerRequest,
  CustomerListResponse,
  CustomerResponse,
  UpdateCustomerNotesRequest,
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

  /** One customer with what the business remembers about them and their recent visits. */
  @Get("{customerId}/profile")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Customer profile retrieved")
  @Response<ApiErrorResponse>(404, "Customer was not found")
  public getCustomerProfile(
    @Path() businessId: string,
    @Path() customerId: string,
  ): Promise<CustomerProfileResponse> {
    return customerProfileService.getCustomerProfile(businessId, customerId);
  }

  /** Replaces the team's private notes about a customer. Customers and the assistant never see them. */
  @Put("{customerId}/notes")
  @Security("jwt", ["business:operate"])
  @SuccessResponse("200", "Notes saved")
  @Response<ApiErrorResponse>(404, "Customer was not found")
  @Response<ApiErrorResponse>(422, "Notes are too long")
  public async updateCustomerNotes(
    @Path() businessId: string,
    @Path() customerId: string,
    @Body() body: UpdateCustomerNotesRequest,
  ): Promise<CustomerProfileResponse> {
    await customerService.updateNotes(businessId, customerId, body.notes);
    return customerProfileService.getCustomerProfile(businessId, customerId);
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
