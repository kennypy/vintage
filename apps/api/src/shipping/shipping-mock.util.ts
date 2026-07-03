import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Guards a mock-fallback site inside a shipping client.
 *
 * Mock rates / labels / tracking / drop-off points exist ONLY for local
 * and dev convenience so flows work without carrier credentials. Returning
 * one in production is dangerous: a fantasy R$16.90 quote misprices the
 * order, and — far worse — a fake label handed to a real buyer is a
 * guaranteed refund + support ticket + trust hit, because nothing ever
 * ships against it.
 *
 * So in production this throws. shipping.service wraps every carrier call
 * in its own `.catch()`, so a throw just drops that one carrier from the
 * results; if every carrier is unavailable the caller receives an empty
 * options list and the checkout shows "frete indisponível no momento"
 * instead of a fake rate. Outside production it is a no-op and the caller
 * proceeds to return the mock.
 */
export function assertShippingMockAllowed(
  nodeEnv: string,
  carrier: string,
  op: string,
): void {
  if (nodeEnv === 'production') {
    throw new ServiceUnavailableException(
      `Frete indisponível no momento (${carrier}/${op}).`,
    );
  }
}
