import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const status = error.getStatus();
      return response.status(status).json(
        typeof body === "object"
          ? body
          : {
              statusCode: status,
              message: body,
              error: HttpStatus[status],
            },
      );
    }
    const code =
      (error as { driverError?: { code?: string }; code?: string })?.driverError
        ?.code ?? (error as { code?: string })?.code;
    const conflict = code === "23505" || code === "23503" || code === "23P01";
    const invalid = code === "23514" || code === "23502" || code === "22P02";
    const status = conflict ? 409 : invalid ? 400 : 500;
    const message =
      code === "23505"
        ? "A record with this value already exists"
        : code === "23503"
          ? "This record is missing or referenced by other records"
          : conflict
            ? "This action conflicts with an existing record"
            : invalid
              ? "The supplied values violate a database constraint"
              : "Internal server error";
    if (status === 500)
      this.logger.error(
        error instanceof Error ? error.stack : "Unexpected request failure",
      );
    return response
      .status(status)
      .json({
        statusCode: status,
        message,
        error: conflict
          ? "Conflict"
          : invalid
            ? "Bad Request"
            : "Internal Server Error",
      });
  }
}
