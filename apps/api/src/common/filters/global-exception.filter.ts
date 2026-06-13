import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        if (res.success === false && res.error && res.error.code) {
          // If the response is already in the correct format, send as-is
          return response.status(status).json(res);
        }
        
        // Handle generic NestJS HttpException response shape
        message = Array.isArray(res.message) ? res.message.join('; ') : res.message || exception.message;
        code = res.error ? String(res.error).toUpperCase().replace(/\s+/g, '_') : 'BAD_REQUEST';
      } else {
        message = String(res || exception.message);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      code = (exception.constructor.name).toUpperCase().replace(/\s+/g, '_');
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
      },
    });
  }
}
