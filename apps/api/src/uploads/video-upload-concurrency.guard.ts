import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Max concurrent in-flight video uploads PER PROCESS.
 *
 * `FileInterceptor` has no `storage` configured, so multer's default
 * MemoryStorage buffers the entire body — up to 100 MB — into RAM, and
 * the handler keeps that buffer alive as the S3 PUT `Body` for the whole
 * round trip. Nothing else bounds how many run at once: the 60 req/min
 * throttler counts REQUESTS, not concurrent bytes, so a dozen slow
 * parallel uploads from one account each pin ~100 MB of RSS and
 * OOM-kill the 1 GB machines we provision.
 *
 * 2 × 100 MB leaves comfortable headroom on a 1 GB container.
 *
 * This is a GUARD rather than a check inside the service on purpose:
 * Nest runs guards before interceptors, so we reject while the body is
 * still on the socket. By the time the service is reached multer has
 * already buffered the full payload and the memory is spent.
 */
const MAX_CONCURRENT_VIDEO_UPLOADS = 2;

@Injectable()
export class VideoUploadConcurrencyGuard implements CanActivate {
  private static readonly logger = new Logger(VideoUploadConcurrencyGuard.name);

  /** Per-process, deliberately: it is this process's heap we're bounding. */
  private static inFlight = 0;

  canActivate(context: ExecutionContext): boolean {
    if (VideoUploadConcurrencyGuard.inFlight >= MAX_CONCURRENT_VIDEO_UPLOADS) {
      VideoUploadConcurrencyGuard.logger.warn(
        `Video upload refused: ${VideoUploadConcurrencyGuard.inFlight} already in flight (cap ${MAX_CONCURRENT_VIDEO_UPLOADS})`,
      );
      throw new ServiceUnavailableException(
        'Muitos envios de vídeo em andamento. Tente novamente em instantes.',
      );
    }

    VideoUploadConcurrencyGuard.inFlight += 1;

    // Release exactly once, whether the response completes normally or
    // the client hangs up mid-upload.
    const res = context.switchToHttp().getResponse<Response>();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      VideoUploadConcurrencyGuard.inFlight -= 1;
    };
    res.once('finish', release);
    res.once('close', release);

    return true;
  }

  /** Test seam — reset the counter between cases. */
  static resetForTests(): void {
    VideoUploadConcurrencyGuard.inFlight = 0;
  }
}
