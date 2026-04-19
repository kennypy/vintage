import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Masks Express / body-parser syntax errors before they reach the
 * client. DAST probe (pen-test track 2 minor observation) found that
 * a malformed-JSON request echoed the parser's own error verbatim:
 *   { "message": "Expected property name or '}' in JSON at position 1
 *     (line 1 column 2)", ... }
 * That response fingerprints the underlying JSON parser + body-parser
 * version (different libraries emit different wording), which is
 * cheap recon for an attacker mapping the stack. No sensitive data,
 * but no reason to ship the detail either.
 *
 * This filter catches anything that body-parser's JSON middleware
 * throws when the payload is unparseable and returns a uniform
 * 400 "Corpo JSON inválido." without revealing the parser internals.
 * Everything else — validation errors, application exceptions, and so
 * on — is untouched and continues through Nest's default pipeline.
 */
@Catch(SyntaxError)
export class JsonSyntaxExceptionFilter implements ExceptionFilter {
  catch(exception: SyntaxError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    // Body-parser marks its SyntaxError with `type === 'entity.parse.failed'`.
    // Application-thrown SyntaxErrors (JSON.parse in handlers) lack that
    // flag, so we still let Nest's default handler process them — masking
    // those would hide genuine bugs.
    const parserError = (exception as SyntaxError & { type?: string }).type;
    if (parserError !== 'entity.parse.failed') {
      throw new BadRequestException('Corpo JSON inválido.');
    }

    res.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'Corpo JSON inválido.',
    });
  }
}
