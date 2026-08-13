import {
  Controller,
  Get,
  Response,
  Route,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../models/api-error.js";

export interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

@Route("health")
@Tags("Health")
export class HealthController extends Controller {
  /**
   * Confirms that the BookWise API process is accepting requests.
   */
  @Get()
  @SuccessResponse("200", "The server is healthy")
  @Response<ApiErrorResponse>(500, "Unexpected server error")
  public getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "bookwise-server",
      timestamp: new Date().toISOString(),
    };
  }
}
