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
import type {
  CreateKnowledgeSourceRequest,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeSourceListResponse,
  KnowledgeSourceResponse,
  UpdateKnowledgeSourceRequest,
} from "../dto/knowledge.dto.js";
import { knowledgeService } from "../knowledge.service.js";

@Route("businesses/{businessId}")
@Tags("Knowledge base")
export class KnowledgeController extends Controller {
  /** Lists the FAQs, policies and instructions the assistant answers from. */
  @Get("knowledge-sources")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Sources retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listKnowledgeSources(@Path() businessId: string): Promise<KnowledgeSourceListResponse> {
    return knowledgeService.listSources(businessId);
  }

  /** Returns one source with its full text. */
  @Get("knowledge-sources/{sourceId}")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Source retrieved")
  @Response<ApiErrorResponse>(404, "Source was not found")
  public getKnowledgeSource(
    @Path() businessId: string,
    @Path() sourceId: string,
  ): Promise<KnowledgeSourceResponse> {
    return knowledgeService.getSource(businessId, sourceId);
  }

  /** Adds a source. It is searchable by keywords at once and by meaning once embedded. */
  @Post("knowledge-sources")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("201", "Source created")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(409, "Source limit reached")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createKnowledgeSource(
    @Path() businessId: string,
    @Body() body: CreateKnowledgeSourceRequest,
  ): Promise<KnowledgeSourceResponse> {
    this.setStatus(201);
    return knowledgeService.createSource(businessId, body);
  }

  /** Edits a source; changed text is re-embedded in the background. */
  @Patch("knowledge-sources/{sourceId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Source updated")
  @Response<ApiErrorResponse>(404, "Source was not found")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public updateKnowledgeSource(
    @Path() businessId: string,
    @Path() sourceId: string,
    @Body() body: UpdateKnowledgeSourceRequest,
  ): Promise<KnowledgeSourceResponse> {
    return knowledgeService.updateSource(businessId, sourceId, body);
  }

  /** Deletes a source and its passages. */
  @Delete("knowledge-sources/{sourceId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("204", "Source deleted")
  @Response<ApiErrorResponse>(404, "Source was not found")
  public async deleteKnowledgeSource(
    @Path() businessId: string,
    @Path() sourceId: string,
  ): Promise<void> {
    await knowledgeService.deleteSource(businessId, sourceId);
    this.setStatus(204);
  }

  /** Shows which passages the assistant would read for a question. */
  @Post("knowledge-search")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Search completed")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public searchKnowledge(
    @Path() businessId: string,
    @Body() body: KnowledgeSearchRequest,
  ): Promise<KnowledgeSearchResponse> {
    return knowledgeService.search(businessId, body.query);
  }
}
